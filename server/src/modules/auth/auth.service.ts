import { AppError, notFound } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { queueMail } from "../../lib/mail.js";
import { hashPassword, verifyDummyPassword, verifyPassword } from "../../lib/password.js";
import { isUniqueConstraintError } from "../../lib/prisma.js";
import { generateToken } from "../../lib/tokens.js";
import { toPublicUser, type PublicUser } from "../users/user.dto.js";
import * as usersRepository from "../users/users.repository.js";
import { emailSchema, usernameSchema } from "../users/users.schemas.js";
import { newSignInMessage } from "./auth-emails.js";
import * as emailVerificationRepository from "./email-verification.repository.js";
import type { ChangePasswordInput, LoginInput, RegisterInput } from "./auth.schemas.js";
import { recordSignIn, type DeviceHint } from "./devices.js";
import { sendVerificationEmail } from "./email-verification.service.js";
import {
  issueSession,
  pruneExpiredSessions,
  revokeOtherSessions,
  revokeSession,
  type IssuedSession,
} from "./session.service.js";

type AuthResult = {
  user: PublicUser;
  session: IssuedSession;
  /** What the browser keeps as its device cookie, so its next sign-in isn't called new. */
  deviceId: string;
};

/**
 * Notes the sign-in for the "new device" email. Keeping that list is a nicety, so it never stops
 * someone signing in: if it fails the sign-in goes ahead, and isn't called new.
 */
async function noteSignIn(userId: string, device: DeviceHint) {
  try {
    return await recordSignIn(userId, device);
  } catch (error) {
    logger.error(`Couldn't record a sign-in device for user ${userId}`, error);
    return { deviceId: device.deviceId ?? generateToken(24), label: "", isNew: false };
  }
}

/** Which of the username and the email a sign-up collided with, as field errors. */
async function conflictFor(input: RegisterInput): Promise<AppError | null> {
  const taken = await usersRepository.findTakenIdentifiers(input);
  const details = [
    ...(taken.username ? [{ path: "username", message: "That username is already taken" }] : []),
    ...(taken.email ? [{ path: "email", message: "An account with that email already exists" }] : []),
  ];
  const first = details[0];
  if (!first) return null;
  return new AppError(409, taken.username ? "USERNAME_TAKEN" : "EMAIL_TAKEN", first.message, details);
}

/**
 * Creates the account and signs it in. The email starts unverified: the link we send it is what
 * the app waits for before letting the person in (see `requireAuth`).
 */
export async function register(input: RegisterInput, device: DeviceHint): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);

  let user: PublicUser;
  try {
    // An address belongs to whoever confirmed it: an account that only claimed it lets go.
    await emailVerificationRepository.releaseUnconfirmedEmail(input.email);
    user = toPublicUser(
      await usersRepository.createUser({
        email: input.email,
        username: input.username,
        displayName: input.displayName,
        passwordHash,
      }),
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) throw (await conflictFor(input)) ?? error;
    throw error;
  }

  // Signing up is the first sign-in on this device: nothing to warn about, the verification email is the email.
  const signIn = await noteSignIn(user.id, device);
  await sendVerificationEmail({ id: user.id, displayName: user.displayName, email: input.email });

  return { user, session: await issueSession(user.id, device.userAgent), deviceId: signIn.deviceId };
}

/** The account a login names, by email address or by username; null when it can't be anyone's. */
function credentialLookup(identifier: string): { email: string } | { username: string } | null {
  if (identifier.includes("@")) {
    const email = emailSchema.safeParse(identifier);
    return email.success ? { email: email.data } : null;
  }
  // Only a name that could have been registered can match an account. MySQL's collation
  // ignores accents, so "álice" would find "alice", and each such spelling would get its
  // own allowance of attempts from the rate limiter. Anything else is an unknown user.
  const username = usernameSchema.safeParse(identifier);
  return username.success ? { username: username.data } : null;
}

export async function login(input: LoginInput, device: DeviceHint): Promise<AuthResult> {
  const lookup = credentialLookup(input.identifier);
  const credentials = lookup ? await usersRepository.findUserCredentials(lookup) : null;

  const valid = credentials
    ? await verifyPassword(credentials.passwordHash, input.password)
    : await verifyDummyPassword(input.password);

  if (!credentials || !valid) {
    // Same response for unknown users and wrong passwords.
    throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password");
  }

  const { passwordHash: _passwordHash, ...row } = credentials;
  const user = toPublicUser(row);
  await pruneExpiredSessions(user.id);

  const signIn = await noteSignIn(user.id, device);
  // Only to an address the person has confirmed: telling a stranger's inbox about an account is noise.
  if (signIn.isNew && user.emailVerified && user.email) {
    queueMail(newSignInMessage({ to: user.email, name: user.displayName, device: signIn.label, at: new Date() }));
  }

  return { user, session: await issueSession(user.id, device.userAgent), deviceId: signIn.deviceId };
}

export async function logout(token: string | undefined): Promise<void> {
  if (token) await revokeSession(token);
}

/**
 * Changes the password once the current one is confirmed, and signs out every other
 * session: whoever might have known the old password is out.
 */
export async function changePassword(
  userId: string,
  currentSessionId: string,
  { currentPassword, newPassword }: ChangePasswordInput,
): Promise<void> {
  const account = await usersRepository.findPasswordHash(userId);
  if (!account) throw notFound("Account not found");
  if (!(await verifyPassword(account.passwordHash, currentPassword))) {
    throw new AppError(400, "INCORRECT_PASSWORD", "Incorrect password", [
      { path: "currentPassword", message: "That's not your current password" },
    ]);
  }

  await usersRepository.setPasswordHash(userId, await hashPassword(newPassword));
  await revokeOtherSessions(userId, currentSessionId);
}

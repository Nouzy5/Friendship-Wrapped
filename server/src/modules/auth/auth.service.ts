import { AppError, notFound } from "../../lib/errors.js";
import { hashPassword, verifyDummyPassword, verifyPassword } from "../../lib/password.js";
import { isUniqueConstraintError } from "../../lib/prisma.js";
import { toPublicUser, type PublicUser } from "../users/user.dto.js";
import * as usersRepository from "../users/users.repository.js";
import type { ChangePasswordInput, LoginInput, RegisterInput } from "./auth.schemas.js";
import {
  issueSession,
  pruneExpiredSessions,
  revokeOtherSessions,
  revokeSession,
  type IssuedSession,
} from "./session.service.js";

type AuthResult = { user: PublicUser; session: IssuedSession };

export async function register(input: RegisterInput, userAgent?: string): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);

  let user: PublicUser;
  try {
    user = toPublicUser(
      await usersRepository.createUser({
        username: input.username,
        displayName: input.displayName,
        passwordHash,
      }),
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, "USERNAME_TAKEN", "That username is already taken", [
        { path: "username", message: "That username is already taken" },
      ]);
    }
    throw error;
  }

  return { user, session: await issueSession(user.id, userAgent) };
}

export async function login(input: LoginInput, userAgent?: string): Promise<AuthResult> {
  const credentials = await usersRepository.findUserCredentials(input.username);

  const valid = credentials
    ? await verifyPassword(credentials.passwordHash, input.password)
    : await verifyDummyPassword(input.password);

  if (!credentials || !valid) {
    // Same response for unknown users and wrong passwords.
    throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect username or password");
  }

  const { passwordHash: _passwordHash, ...row } = credentials;
  const user = toPublicUser(row);
  await pruneExpiredSessions(user.id);

  return { user, session: await issueSession(user.id, userAgent) };
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

import { adminEmails } from "../../config/env.js";
import { AppError, badRequest, notFound } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { queueMail, sendMail, type MailMessage } from "../../lib/mail.js";
import { verifyPassword } from "../../lib/password.js";
import { isUniqueConstraintError } from "../../lib/prisma.js";
import { generateToken, sha256Hex } from "../../lib/tokens.js";
import { toPublicUser, type PublicUser } from "../users/user.dto.js";
import * as usersRepository from "../users/users.repository.js";
import { emailChangedMessage, verifyEmailMessage, verifyEmailUrl } from "./auth-emails.js";
import * as repository from "./email-verification.repository.js";
import type { ChangeEmailInput } from "./auth.schemas.js";

const HOUR_MS = 60 * 60 * 1000;
/** How long the emailed link works. */
export const VERIFICATION_TTL_MS = 24 * HOUR_MS;
/** The wait between two emails to the same person: a button pressed twice, or a mailbox flooded. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

type Recipient = { id: string; displayName: string; email: string };

/**
 * A fresh link for the address, stored but not yet in anyone's inbox. The links sent before still work
 * until this one has really been sent (see `retireOlderLinks`): a mail server that's down mustn't
 * take away a link that was working.
 */
async function createLink(recipient: Recipient): Promise<{ tokenId: string; message: MailMessage }> {
  const token = generateToken(32);
  const tokenId = sha256Hex(token);
  await repository.createToken({
    id: tokenId,
    userId: recipient.id,
    email: recipient.email,
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
  });
  // No name in it: it goes to whatever address was typed in, which may not be the person's own.
  const message = verifyEmailMessage({
    to: recipient.email,
    url: verifyEmailUrl(token),
    validForHours: VERIFICATION_TTL_MS / HOUR_MS,
  });
  return { tokenId, message };
}

/** Only the newest link works. */
const retireOlderLinks = (userId: string, newestId: string) => repository.deleteTokensExcept(userId, newestId);

/**
 * Emails the person a link to confirm their address, in the background (right after signing up
 * or changing it, where a failure is shown by the "send again" button rather than an error).
 */
export async function sendVerificationEmail(recipient: Recipient): Promise<void> {
  try {
    const { tokenId, message } = await createLink(recipient);
    await retireOlderLinks(recipient.id, tokenId);
    queueMail(message);
  } catch (error) {
    logger.error(`Couldn't prepare the verification email for user ${recipient.id}`, error);
  }
}

/** Fails with 429 while the last email was sent less than a minute ago. */
async function assertNotTooSoon(userId: string): Promise<void> {
  const last = await repository.newestTokenTime(userId);
  if (!last) return;

  const waitMs = last.getTime() + RESEND_COOLDOWN_MS - Date.now();
  if (waitMs > 0) {
    const seconds = Math.ceil(waitMs / 1000);
    throw new AppError(429, "EMAIL_COOLDOWN", `Please wait ${seconds} seconds before asking for another email`, {
      retryAfterSeconds: seconds,
    });
  }
}

/** "Send it again": the person's own request, so the result is reported (and waited for). */
export async function resendVerificationEmail(userId: string): Promise<void> {
  const account = await usersRepository.findEmailAccount(userId);
  if (!account) throw notFound("Account not found");
  if (!account.email) throw badRequest("Add your email address first");
  if (account.emailVerifiedAt) return;

  await assertNotTooSoon(userId);
  const { tokenId, message } = await createLink({ id: account.id, displayName: account.displayName, email: account.email });
  try {
    await sendMail(message);
  } catch (error) {
    // The earlier link, if it hasn't expired, keeps working.
    await repository.deleteToken(tokenId);
    logger.error(`Couldn't send the verification email to user ${userId}`, error);
    throw new AppError(503, "EMAIL_SEND_FAILED", "We couldn't send the email. Please try again in a few minutes.");
  }
  await retireOlderLinks(userId, tokenId);
}

/**
 * Opens a link from an email: marks the address verified. Single use, and only while it is still the
 * person's address. Works whether or not they're signed in (the link is opened from a mail app, often
 * on another device), with one exception: an address on the admin list is only confirmed by someone
 * signed in to the account that holds it (`viewerId`). Otherwise whoever signs up with the owner's
 * address first could be made an admin by the owner opening the link they were sent, or by a mail
 * scanner that runs scripts.
 */
export async function confirmEmail(token: string, viewerId: string | undefined): Promise<{ email: string }> {
  const invalid = () => new AppError(400, "INVALID_LINK", "This link has expired or was already used");

  const id = sha256Hex(token);
  const row = await repository.findToken(id);
  if (!row || row.expiresAt.getTime() <= Date.now()) throw invalid();

  if (adminEmails.has(row.email) && viewerId !== row.userId) {
    throw new AppError(
      403,
      "SIGN_IN_TO_CONFIRM",
      "This address opens the admin panel, so confirm it in a browser where you're logged in to the account that has it. Log in there, then open the link again.",
    );
  }

  const changed = await usersRepository.markEmailVerified(row.userId, row.email, new Date());
  if (changed === 0) {
    // Already verified is fine (a second tap on the same link); a different address now is not.
    const account = await usersRepository.findEmailAccount(row.userId);
    if (account?.email !== row.email || !account.emailVerifiedAt) throw invalid();
  }

  await repository.deleteTokensForUser(row.userId);
  return { email: row.email };
}

/**
 * Sets (or replaces) the account's address once the person confirms with their password, and
 * emails a link to the new one. The address counts as unverified until that link is opened.
 * When an address that was verified is replaced, the old one is told, in case it wasn't them.
 */
export async function changeEmail(userId: string, { email, password }: ChangeEmailInput): Promise<PublicUser> {
  const account = await usersRepository.findEmailAccount(userId);
  const hash = await usersRepository.findPasswordHash(userId);
  if (!account || !hash) throw notFound("Account not found");

  if (!(await verifyPassword(hash.passwordHash, password))) {
    throw new AppError(400, "INCORRECT_PASSWORD", "Incorrect password", [
      { path: "password", message: "That's not your password" },
    ]);
  }

  if (account.email === email) {
    if (account.emailVerifiedAt) {
      throw new AppError(409, "EMAIL_UNCHANGED", "That's already your email address", [
        { path: "email", message: "That's already your email address" },
      ]);
    }
    // The same unconfirmed address again: just send the link once more.
    await resendVerificationEmail(userId);
    const current = await usersRepository.findPublicUser(userId);
    if (!current) throw notFound("Account not found");
    return toPublicUser(current);
  }

  let user: PublicUser;
  try {
    // Someone who only claimed this address, without confirming it, doesn't hold it against us.
    await repository.releaseUnconfirmedEmail(email);
    user = toPublicUser(await usersRepository.setEmail(userId, email));
  } catch (error) {
    if (isUniqueConstraintError(error)) throw emailTaken();
    throw error;
  }

  if (account.email && account.emailVerifiedAt) {
    queueMail(emailChangedMessage({ to: account.email, name: account.displayName, newEmail: email, at: new Date() }));
  }
  await sendVerificationEmail({ id: user.id, displayName: user.displayName, email });
  return user;
}

/** Forgets links nobody opened in time. */
export async function sweepExpiredVerificationTokens(): Promise<void> {
  try {
    await repository.deleteExpiredTokens(new Date());
  } catch (error) {
    logger.error("Sweeping expired verification links failed", error);
  }
}

export const emailTaken = () =>
  new AppError(409, "EMAIL_TAKEN", "An account with that email already exists", [
    { path: "email", message: "An account with that email already exists" },
  ]);

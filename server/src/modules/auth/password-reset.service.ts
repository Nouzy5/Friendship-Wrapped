import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { queueMail } from "../../lib/mail.js";
import { hashPassword } from "../../lib/password.js";
import { generateToken, sha256Hex } from "../../lib/tokens.js";
import * as usersRepository from "../users/users.repository.js";
import { passwordChangedMessage, passwordResetMessage, resetPasswordUrl } from "./auth-emails.js";
import { credentialLookup } from "./credential-lookup.js";
import * as repository from "./password-reset.repository.js";

const MINUTE_MS = 60 * 1000;
/** How long the emailed link works. Short: it is as good as the password while it does. */
export const RESET_TTL_MS = 60 * MINUTE_MS;
/** The wait between two emails to the same person: a button pressed twice, or a mailbox flooded. */
export const RESET_COOLDOWN_MS = MINUTE_MS;

const invalidLink = () => new AppError(400, "INVALID_LINK", "This link has expired or was already used");

/**
 * Emails a link to choose a new password to the address on the account the email address or username
 * names. Says nothing about whether there was such an account, whether it has an address, or whether
 * a mail went out (a one-a-minute cooldown is skipped in silence too): anyone can ask for any name,
 * and an answer would let them find out who has an account here.
 *
 * Goes to the address whether or not it's confirmed (someone who never opened the first link can
 * still get in), and only to that address, whoever asks. Earlier links stay valid: a stranger asking
 * again mustn't cancel the one you're about to open.
 */
export async function requestPasswordReset(identifier: string): Promise<void> {
  try {
    const lookup = credentialLookup(identifier);
    const account = lookup ? await usersRepository.findEmailAccountBy(lookup) : null;
    // Accounts from before email was required have nowhere to send it.
    if (!account?.email) return;

    const last = await repository.newestTokenTime(account.id);
    if (last && last.getTime() + RESET_COOLDOWN_MS > Date.now()) return;

    const token = generateToken(32);
    await repository.createToken({
      id: sha256Hex(token),
      userId: account.id,
      email: account.email,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    queueMail(passwordResetMessage({ to: account.email, url: resetPasswordUrl(token), validForMinutes: RESET_TTL_MS / MINUTE_MS }));
  } catch (error) {
    // The same answer as when there was nothing to send: the person asks again.
    logger.error("Couldn't prepare a password reset email", error);
  }
}

/** The account a link can still reset, or null: unknown, expired, or for an address the account no longer has. */
async function accountForLink(token: string) {
  const tokenId = sha256Hex(token);
  const row = await repository.findToken(tokenId);
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;

  const account = await usersRepository.findEmailAccount(row.userId);
  if (!account || account.email !== row.email) return null;
  return { ...account, email: row.email, tokenId };
}

/** Whether a link still works, so the page can say so before someone types a new password. Changes nothing. */
export async function checkResetLink(token: string): Promise<void> {
  if (!(await accountForLink(token))) throw invalidLink();
}

/**
 * Sets a new password with a link from an email, and signs every device out. Single use, and only
 * while the account still has the address it was sent to. Needs no session: the link is opened from a
 * mail app, by someone who can't sign in. It doesn't sign them in either; they do that with the new
 * password, like anyone coming back.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const account = await accountForLink(token);
  if (!account) throw invalidLink();

  const passwordHash = await hashPassword(newPassword);
  const done = await repository.spendToken({
    tokenId: account.tokenId,
    userId: account.id,
    email: account.email,
    passwordHash,
    now: new Date(),
  });
  if (!done) throw invalidLink();

  queueMail(passwordChangedMessage({ to: account.email, name: account.displayName, at: new Date() }));
}

/** Forgets links nobody opened in time. */
export async function sweepExpiredResetTokens(): Promise<void> {
  try {
    await repository.deleteExpiredTokens(new Date());
  } catch (error) {
    logger.error("Sweeping expired password reset links failed", error);
  }
}

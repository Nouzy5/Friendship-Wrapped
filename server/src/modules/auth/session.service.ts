import { generateToken, sha256Hex } from "../../lib/tokens.js";
import { toPublicUser, type PublicUser } from "../users/user.dto.js";
import * as sessionRepository from "./session.repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
/** Sliding expiry: once less than this remains, an active session is extended to a full TTL. */
const RENEW_WHEN_REMAINING_MS = 15 * DAY_MS;

/** 32 random bytes, base64url-encoded. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type IssuedSession = { token: string; expiresAt: Date };

export type ActiveSession = {
  token: string;
  user: PublicUser;
  expiresAt: Date;
  renewed: boolean;
};

/** Only the hash is stored, so a database leak doesn't expose usable session tokens. */
export function hashSessionToken(token: string): string {
  return sha256Hex(token);
}

export async function issueSession(userId: string): Promise<IssuedSession> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await sessionRepository.createSession({ id: hashSessionToken(token), userId, expiresAt });
  return { token, expiresAt };
}

/** Returns the signed-in user for a token, or null if the token is unknown or expired. */
export async function resolveSession(token: string): Promise<ActiveSession | null> {
  if (!TOKEN_PATTERN.test(token)) return null;

  const id = hashSessionToken(token);
  const session = await sessionRepository.findSessionWithUser(id);
  if (!session) return null;

  const now = Date.now();
  const remaining = session.expiresAt.getTime() - now;

  if (remaining <= 0) {
    await sessionRepository.deleteSession(id);
    return null;
  }

  const user = toPublicUser(session.user);

  if (remaining < RENEW_WHEN_REMAINING_MS) {
    const expiresAt = new Date(now + SESSION_TTL_MS);
    await sessionRepository.updateSessionExpiry(id, expiresAt);
    return { token, user, expiresAt, renewed: true };
  }

  return { token, user, expiresAt: session.expiresAt, renewed: false };
}

export async function revokeSession(token: string): Promise<void> {
  if (!TOKEN_PATTERN.test(token)) return;
  await sessionRepository.deleteSession(hashSessionToken(token));
}

export async function pruneExpiredSessions(userId: string): Promise<void> {
  await sessionRepository.deleteExpiredSessions(userId, new Date());
}

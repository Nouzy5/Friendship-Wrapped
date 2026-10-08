import { notFound } from "../../lib/errors.js";
import { generateToken, sha256Hex } from "../../lib/tokens.js";
import { toPublicUser, type PublicUser } from "../users/user.dto.js";
import { toSessionView, type SessionView } from "./session.dto.js";
import * as sessionRepository from "./session.repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
/** Sliding expiry: once less than this remains, an active session is extended to a full TTL. */
const RENEW_WHEN_REMAINING_MS = 15 * DAY_MS;
/** `lastActiveAt` is only written when it's at least this stale, so most requests don't write. */
const ACTIVITY_RESOLUTION_MS = 5 * 60 * 1000;
/** The stored user agent is cut to the column's size. */
const USER_AGENT_MAX_LENGTH = 255;

/** 32 random bytes, base64url-encoded. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type IssuedSession = { token: string; expiresAt: Date };

export type ActiveSession = {
  token: string;
  /** The stored id (the token's hash). */
  id: string;
  user: PublicUser;
  expiresAt: Date;
  renewed: boolean;
};

/** Only the hash is stored, so a database leak doesn't expose usable session tokens. */
export function hashSessionToken(token: string): string {
  return sha256Hex(token);
}

/** `userAgent` labels the session in the person's list of signed-in devices. */
export async function issueSession(userId: string, userAgent?: string): Promise<IssuedSession> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await sessionRepository.createSession({
    id: hashSessionToken(token),
    userId,
    expiresAt,
    userAgent: userAgent?.slice(0, USER_AGENT_MAX_LENGTH) || null,
  });
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
  const renewed = remaining < RENEW_WHEN_REMAINING_MS;
  const expiresAt = renewed ? new Date(now + SESSION_TTL_MS) : session.expiresAt;
  const stale = now - session.lastActiveAt.getTime() >= ACTIVITY_RESOLUTION_MS;

  if (renewed || stale) {
    await sessionRepository.touchSession(id, {
      lastActiveAt: new Date(now),
      ...(renewed && { expiresAt }),
    });
  }

  return { token, id, user, expiresAt, renewed };
}

export async function revokeSession(token: string): Promise<void> {
  if (!TOKEN_PATTERN.test(token)) return;
  await sessionRepository.deleteSession(hashSessionToken(token));
}

export async function pruneExpiredSessions(userId: string): Promise<void> {
  await sessionRepository.deleteExpiredSessions(userId, new Date());
}

/** The person's signed-in devices: this one first, then the most recently active. */
export async function listSessions(userId: string, currentId: string): Promise<SessionView[]> {
  const sessions = await sessionRepository.listSessions(userId, new Date());
  return sessions
    .map((session) => toSessionView(session, currentId))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** Signs one of the person's devices out (by its public id). */
export async function revokeSessionById(userId: string, publicId: string): Promise<void> {
  const { count } = await sessionRepository.deleteSessionByPublicId(userId, publicId);
  if (count === 0) throw notFound("Session not found");
}

/** Signs the person out everywhere but here. */
export async function revokeOtherSessions(userId: string, currentId: string): Promise<void> {
  await sessionRepository.deleteOtherSessions(userId, currentId);
}

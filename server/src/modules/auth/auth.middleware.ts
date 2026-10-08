import type { Request, RequestHandler, Response } from "express";
import { unauthorized } from "../../lib/errors.js";
import type { PublicUser } from "../users/user.dto.js";
import { clearSessionCookie, readSessionCookie, setSessionCookie } from "./session-cookie.js";
import { resolveSession } from "./session.service.js";

/**
 * Resolves the session cookie to a user. Clears a stale cookie and re-sends the
 * cookie when the session's expiry was extended.
 */
export async function authenticate(req: Request, res: Response): Promise<PublicUser | null> {
  const token = readSessionCookie(req);
  if (!token) return null;

  const session = await resolveSession(token);
  if (!session) {
    clearSessionCookie(res);
    return null;
  }

  if (session.renewed) setSessionCookie(res, session.token, session.expiresAt);
  req.sessionId = session.id;
  return session.user;
}

/** Rejects the request with 401 unless it carries a valid session. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const user = await authenticate(req, res);
  if (!user) throw unauthorized("Please log in to continue");

  req.user = user;
  next();
};

/** The authenticated user for a request that passed `requireAuth`. */
export function currentUser(req: Request): PublicUser {
  if (!req.user) throw unauthorized("Please log in to continue");
  return req.user;
}

/** The stored id of the session a request that passed `requireAuth` came with. */
export function currentSessionId(req: Request): string {
  if (!req.sessionId) throw unauthorized("Please log in to continue");
  return req.sessionId;
}

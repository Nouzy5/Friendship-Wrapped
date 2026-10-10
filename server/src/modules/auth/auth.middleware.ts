import type { Request, RequestHandler, Response } from "express";
import { AppError, notFound, unauthorized } from "../../lib/errors.js";
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

/**
 * Rejects the request with 403 EMAIL_NOT_VERIFIED: the person is signed in, but hasn't confirmed
 * their email address (or, for an account made before email was required, hasn't added one).
 */
export const emailNotVerified = (user: PublicUser) =>
  new AppError(
    403,
    "EMAIL_NOT_VERIFIED",
    user.email ? "Confirm your email address to continue" : "Add your email address to continue",
  );

/**
 * Rejects the request with 401 unless it carries a valid session. For the few routes an account
 * can use before its email is verified: confirming the address is what they're for. Everything
 * else uses `requireAuth`.
 */
export const requireSession: RequestHandler = async (req, res, next) => {
  const user = await authenticate(req, res);
  if (!user) throw unauthorized("Please log in to continue");

  req.user = user;
  next();
};

/** Rejects the request with 401 unless it carries a valid session, and 403 until the email is verified. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const user = await authenticate(req, res);
  if (!user) throw unauthorized("Please log in to continue");
  if (!user.emailVerified) throw emailNotVerified(user);

  req.user = user;
  next();
};

/**
 * Only for whoever runs the server (see ADMIN_EMAILS). Everyone else gets a 404, as if the admin
 * panel weren't there. Use after `requireAuth`.
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!currentUser(req).isAdmin) throw notFound();
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

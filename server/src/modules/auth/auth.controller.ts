import type { RequestHandler } from "express";
import { authenticate, currentSessionId, currentUser } from "./auth.middleware.js";
import { changePasswordSchema, loginSchema, registerSchema, sessionParamsSchema } from "./auth.schemas.js";
import * as authService from "./auth.service.js";
import { clearSessionCookie, readSessionCookie, setSessionCookie } from "./session-cookie.js";
import { publicSessionId } from "./session.dto.js";
import * as sessionService from "./session.service.js";

export const register: RequestHandler = async (req, res) => {
  const input = registerSchema.parse(req.body);
  const { user, session } = await authService.register(input, req.get("user-agent"));

  setSessionCookie(res, session.token, session.expiresAt);
  res.status(201).json({ user });
};

export const login: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const { user, session } = await authService.login(input, req.get("user-agent"));

  setSessionCookie(res, session.token, session.expiresAt);
  res.json({ user });
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(readSessionCookie(req));

  clearSessionCookie(res);
  res.status(204).end();
};

/** Who am I? Responds `{ user: null }` (not 401) when signed out, so clients can check cheaply. */
export const getSession: RequestHandler = async (req, res) => {
  const user = await authenticate(req, res);
  res.json({ user });
};

/** PUT /users/me/password — `{ currentPassword, newPassword }`; every other session is signed out. */
export const changePassword: RequestHandler = async (req, res) => {
  const input = changePasswordSchema.parse(req.body);
  await authService.changePassword(currentUser(req).id, currentSessionId(req), input);
  res.status(204).end();
};

/** GET /users/me/sessions — your signed-in devices, this one first. */
export const listSessions: RequestHandler = async (req, res) => {
  res.json({ sessions: await sessionService.listSessions(currentUser(req).id, currentSessionId(req)) });
};

/** DELETE /users/me/sessions/:sessionId — signs that device out (this one too, if it's this one). */
export const revokeSession: RequestHandler = async (req, res) => {
  const { sessionId } = sessionParamsSchema.parse(req.params);
  await sessionService.revokeSessionById(currentUser(req).id, sessionId);
  if (sessionId === publicSessionId(currentSessionId(req))) clearSessionCookie(res);
  res.status(204).end();
};

/** DELETE /users/me/sessions — signs out everywhere but here. */
export const revokeOtherSessions: RequestHandler = async (req, res) => {
  await sessionService.revokeOtherSessions(currentUser(req).id, currentSessionId(req));
  res.status(204).end();
};

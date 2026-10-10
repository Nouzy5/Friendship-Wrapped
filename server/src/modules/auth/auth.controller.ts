import type { RequestHandler } from "express";
import { AppError } from "../../lib/errors.js";
import { authenticate, currentSessionId, currentUser } from "./auth.middleware.js";
import {
  changeEmailSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  resetTokenSchema,
  sessionParamsSchema,
  verifyEmailSchema,
} from "./auth.schemas.js";
import * as authService from "./auth.service.js";
import { deviceHint, setDeviceCookie } from "./devices.js";
import * as emailVerification from "./email-verification.service.js";
import * as passwordReset from "./password-reset.service.js";
import { clearSessionCookie, readSessionCookie, setSessionCookie } from "./session-cookie.js";
import { publicSessionId } from "./session.dto.js";
import * as sessionService from "./session.service.js";

export const register: RequestHandler = async (req, res) => {
  const input = registerSchema.parse(req.body);
  const { user, session, deviceId } = await authService.register(input, deviceHint(req));

  setSessionCookie(res, session.token, session.expiresAt);
  setDeviceCookie(res, deviceId);
  res.status(201).json({ user });
};

/** `{ identifier, password }`: the identifier is an email address or a username (`username` is its older name). */
export const login: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const { user, session, deviceId } = await authService.login(input, deviceHint(req));

  setSessionCookie(res, session.token, session.expiresAt);
  setDeviceCookie(res, deviceId);
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

/**
 * POST /auth/verify-email — `{ token }` from the emailed link. Needs no session: the link is
 * opened from a mail app, often on another device than the one that signed up. (An admin
 * address is the exception: it's confirmed only by someone signed in to the account that has it.)
 */
export const verifyEmail: RequestHandler = async (req, res) => {
  const input = verifyEmailSchema.safeParse(req.body);
  if (!input.success) throw new AppError(400, "INVALID_LINK", "This link isn't valid");

  const viewer = await authenticate(req, res);
  const { email } = await emailVerification.confirmEmail(input.data.token, viewer?.id);
  res.json({ verified: true, email });
};

/** POST /auth/email/resend — sends the confirmation link again (at most one a minute). */
export const resendVerificationEmail: RequestHandler = async (req, res) => {
  await emailVerification.resendVerificationEmail(currentUser(req).id);
  res.status(204).end();
};

/** PUT /auth/email — `{ email, password }`: sets or changes the address; it must be confirmed again. */
export const changeEmail: RequestHandler = async (req, res) => {
  const input = changeEmailSchema.parse(req.body);
  const user = await emailVerification.changeEmail(currentUser(req).id, input);
  res.json({ user });
};

/**
 * POST /auth/forgot-password — `{ identifier }`, an email address or a username. Always 204, whether
 * or not there is such an account: the answer mustn't tell who has one.
 */
export const forgotPassword: RequestHandler = async (req, res) => {
  const input = forgotPasswordSchema.parse(req.body);
  await passwordReset.requestPasswordReset(input.identifier);
  res.status(204).end();
};

/** POST /auth/reset-password/check — `{ token }`: 204 if the link still works. Changes nothing, so a mail scanner opening it can't spend the link. */
export const checkPasswordResetLink: RequestHandler = async (req, res) => {
  const input = resetTokenSchema.safeParse(req.body);
  if (!input.success) throw new AppError(400, "INVALID_LINK", "This link isn't valid");

  await passwordReset.checkResetLink(input.data.token);
  res.status(204).end();
};

/** POST /auth/reset-password — `{ token, newPassword }` from the emailed link. Signs every device out; the person logs in again. */
export const resetPassword: RequestHandler = async (req, res) => {
  const link = resetTokenSchema.safeParse(req.body);
  if (!link.success) throw new AppError(400, "INVALID_LINK", "This link isn't valid");
  const input = resetPasswordSchema.parse(req.body);

  // A browser signed in to this account has a dead cookie now; the next request clears it. One signed
  // in to someone else's account keeps working, so the cookie is left alone.
  await passwordReset.resetPassword(input.token, input.newPassword);
  res.status(204).end();
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

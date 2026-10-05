import type { RequestHandler } from "express";
import { authenticate } from "./auth.middleware.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";
import * as authService from "./auth.service.js";
import { clearSessionCookie, readSessionCookie, setSessionCookie } from "./session-cookie.js";

export const register: RequestHandler = async (req, res) => {
  const input = registerSchema.parse(req.body);
  const { user, session } = await authService.register(input);

  setSessionCookie(res, session.token, session.expiresAt);
  res.status(201).json({ user });
};

export const login: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const { user, session } = await authService.login(input);

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

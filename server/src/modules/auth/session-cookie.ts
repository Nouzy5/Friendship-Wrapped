import type { CookieOptions, Request, Response } from "express";
import { isProduction } from "../../config/env.js";
import { getCookie } from "../../lib/cookies.js";

// In production the __Host- prefix makes browsers reject the cookie unless it is
// Secure, host-only and Path=/. It can't be used over plain http in development.
export const SESSION_COOKIE_NAME = isProduction ? "__Host-fw_session" : "fw_session";

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
};

export function readSessionCookie(req: Request): string | undefined {
  return getCookie(req.headers.cookie, SESSION_COOKIE_NAME);
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE_NAME, token, { ...cookieOptions, expires: expiresAt });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
}

import type { RequestHandler } from "express";
import { forbidden } from "../lib/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isSameHost(origin: string, host: string | undefined): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * CSRF defence in depth on top of SameSite=Lax session cookies: browsers send an
 * Origin header with cross-site requests, so reject state-changing requests whose
 * Origin doesn't match the host they were sent to.
 */
export const requireSameOrigin: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin");
  if (origin !== undefined && !isSameHost(origin, req.get("host"))) {
    throw forbidden("Cross-origin requests are not allowed");
  }

  next();
};

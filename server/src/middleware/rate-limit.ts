import type { Request, RequestHandler } from "express";
import { AppError } from "../lib/errors.js";

type RateLimitOptions = {
  windowMs: number;
  limit: number;
  key: (req: Request) => string;
  message: string;
};

const MAX_TRACKED_KEYS = 10_000;

/**
 * Fixed-window, in-memory rate limiter. Fine for a single API process; move the
 * counters to a shared store (e.g. Redis) if the API ever runs on multiple instances.
 */
export function rateLimit({ windowMs, limit, key, message }: RateLimitOptions): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();

    if (hits.size > MAX_TRACKED_KEYS) {
      for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
    }

    const k = key(req);
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }

    entry.count += 1;

    if (entry.count > limit) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new AppError(429, "RATE_LIMITED", message);
    }

    next();
  };
}

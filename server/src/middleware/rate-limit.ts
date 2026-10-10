import type { Request, RequestHandler } from "express";
import { AppError } from "../lib/errors.js";

type RateLimitOptions = {
  windowMs: number;
  limit: number;
  key: (req: Request) => string;
  message: string;
};

/** Memory stays bounded however many different keys arrive (keys are at most ~100 characters). */
const MAX_TRACKED_KEYS = 100_000;

/** Every limiter's counters, so tests can start each test with a clean slate. */
const allHits = new Set<Map<string, { count: number; resetAt: number }>>();

/** Forgets every attempt counted so far, by every limiter. For tests, which all come from one address. */
export function resetRateLimits(): void {
  for (const hits of allHits) hits.clear();
}

/**
 * Fixed-window, in-memory rate limiter. Fine for a single API process; move the
 * counters to a shared store (e.g. Redis) if the API ever runs on multiple instances.
 */
export function rateLimit({ windowMs, limit, key, message }: RateLimitOptions): RequestHandler {
  // Every window is equally long, so insertion order is expiry order: the oldest come first.
  const hits = new Map<string, { count: number; resetAt: number }>();
  allHits.add(hits);

  return (req, res, next) => {
    const now = Date.now();

    const k = key(req);
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      hits.delete(k); // re-inserted at the end, keeping the order
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
      // Drop expired windows, and the oldest live ones if there are too many.
      for (const [oldKey, old] of hits) {
        if (old.resetAt > now && hits.size <= MAX_TRACKED_KEYS) break;
        hits.delete(oldKey);
      }
    }

    entry.count += 1;

    if (entry.count > limit) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new AppError(429, "RATE_LIMITED", message);
    }

    next();
  };
}

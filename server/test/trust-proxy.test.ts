import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetRateLimits } from "../src/middleware/rate-limit.js";

// Login is limited per address and name, so how requests are told apart by address shows up in
// who shares a budget. Every request here really comes from the same socket (supertest's loopback).
const LOGIN_ATTEMPTS = 10;

beforeEach(() => {
  resetRateLimits();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A wrong guess at someone's password, with the `X-Forwarded-For` header a proxy would add. */
function guess(app: Express, forwardedFor?: string) {
  const req = request(app).post("/api/auth/login");
  if (forwardedFor) req.set("X-Forwarded-For", forwardedFor);
  return req.send({ identifier: "nobody@example.com", password: "not the password" });
}

/** Spends the whole login budget of whoever `forwardedFor` makes the request look like. */
async function useUpBudget(app: Express, forwardedFor?: string) {
  for (let i = 0; i < LOGIN_ATTEMPTS; i++) expect((await guess(app, forwardedFor)).status).toBe(401);
  expect((await guess(app, forwardedFor)).status).toBe(429);
}

describe("with no proxy in front (the default)", () => {
  const app = createApp({ trustProxy: 0 });

  it("ignores X-Forwarded-For, so it can't be used to dodge a limit", async () => {
    await useUpBudget(app, "203.0.113.1");

    // A different claimed address doesn't get a fresh budget: it's the same caller.
    expect((await guess(app, "203.0.113.2")).status).toBe(429);
    expect((await guess(app, "198.51.100.9, 203.0.113.3")).status).toBe(429);
  });
});

describe("with one proxy in front", () => {
  const app = createApp({ trustProxy: 1 });

  it("limits each client the proxy forwards separately", async () => {
    await useUpBudget(app, "203.0.113.1");

    expect((await guess(app, "203.0.113.1")).status).toBe(429);
    expect((await guess(app, "203.0.113.2")).status).toBe(401);
  });

  it("only believes the address the proxy added, not what the client put before it", async () => {
    // The proxy appends the address it saw to whatever the client sent, so only the last entry is trusted.
    await useUpBudget(app, "198.51.100.1, 203.0.113.1");

    expect((await guess(app, "198.51.100.2, 203.0.113.1")).status).toBe(429);
    expect((await guess(app, "203.0.113.1")).status).toBe(429);
    expect((await guess(app, "198.51.100.1, 203.0.113.2")).status).toBe(401);
  });

  it("falls back to the connection's address when the header is missing", async () => {
    await useUpBudget(app);

    expect((await guess(app)).status).toBe(429);
  });
});

describe("TRUST_PROXY", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** What the setting comes to when the server starts with `TRUST_PROXY=value`. */
  async function proxyCount(value: string | undefined) {
    vi.stubEnv("TRUST_PROXY", value);
    vi.resetModules();
    return (await import("../src/config/env.js")).trustProxyCount;
  }

  it.each([
    [undefined, 0],
    ["", 0],
    ["false", 0],
    ["FALSE", 0],
    ["0", 0],
    ["1", 1],
    [" 2 ", 2],
  ])("reads %j as %i proxies", async (value, count) => {
    expect(await proxyCount(value)).toBe(count);
  });

  it.each(["true", "yes", "-1", "1.5", "100", "127.0.0.1", "loopback"])("refuses %j", async (value) => {
    await expect(proxyCount(value)).rejects.toThrow(/TRUST_PROXY must be the number of reverse proxies/);
  });

  it("is off in an app created without a setting", () => {
    expect(createApp().get("trust proxy")).toBe(false);
  });

  it("is applied by createApp", async () => {
    vi.stubEnv("TRUST_PROXY", "2");
    vi.resetModules();
    const { createApp: createAppFromEnv } = await import("../src/app.js");

    expect(createAppFromEnv().get("trust proxy")).toBe(2);
  });
});

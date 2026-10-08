import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashSessionToken } from "../src/modules/auth/session.service.js";
import { resetDatabase, sessionCookiePair, sessionSetCookie, testUser } from "./helpers.js";

const app = createApp();
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(resetDatabase);

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

/** Registers `testUser` with a cookie-keeping agent, i.e. a signed-in browser. */
async function signedInAgent() {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send(testUser);
  expect(res.status).toBe(201);
  return { agent, cookie: sessionCookiePair(res) };
}

describe("POST /api/auth/register", () => {
  it("creates the account and signs the user in", async () => {
    const res = await request(app).post("/api/auth/register").send(testUser);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: {
        id: expect.any(String),
        username: "alice",
        displayName: "Alice",
        avatarUrl: null,
        createdAt: expect.any(String),
      },
    });

    const cookie = sessionSetCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
  });

  it("stores only a password hash and a hashed session token", async () => {
    const res = await request(app).post("/api/auth/register").send(testUser);
    const token = sessionCookiePair(res).split("=")[1]!;

    const user = await prisma.user.findUniqueOrThrow({ where: { username: "alice" } });
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(user.passwordHash).not.toContain(testUser.password);

    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.id).toBe(hashSessionToken(token));
    expect(session.id).not.toBe(token);
  });

  it("normalizes the username", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...testUser, username: "  Alice.B_ " });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe("alice.b_");
  });

  it("rejects a taken username regardless of case", async () => {
    await request(app).post("/api/auth/register").send(testUser);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...testUser, username: "ALICE" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("USERNAME_TAKEN");
    expect(res.body.error.details).toEqual([{ path: "username", message: "That username is already taken" }]);
  });

  it("returns field-level validation errors", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "a!", displayName: "   ", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["username", "displayName", "password"]));
  });

  it.each([".alice", "alice.", "al..ice", "al ice", "ab"])("rejects the username %j", async (username) => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...testUser, username });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send(testUser);
  });

  it("signs in with a case-insensitive username", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: " ALICE ", password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("alice");
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(sessionSetCookie(res)).toBeDefined();
  });

  it("doesn't let spellings MySQL treats as the same name sign in", async () => {
    // The database's collation ignores accents, so "álice" would otherwise find "alice"
    // (and get its own allowance of attempts from the rate limiter).
    for (const username of ["álice", "a\u0301lice", "alicé"]) {
      const res = await request(app).post("/api/auth/login").send({ username, password: testUser.password });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    }
  });

  it("gives wrong passwords and unknown usernames the same response", async () => {
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ username: "alice", password: "not the password" });
    const unknownUser = await request(app)
      .post("/api/auth/login")
      .send({ username: "nobody", password: "not the password" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownUser.body);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(sessionSetCookie(wrongPassword)).toBeUndefined();
  });

  it("rate limits repeated attempts against one account", async () => {
    const attempt = () =>
      request(app).post("/api/auth/login").send({ username: "rate.limited", password: "wrong-password" });

    for (let i = 0; i < 10; i++) {
      expect((await attempt()).status).toBe(401);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });
});

describe("GET /api/auth/session", () => {
  it("returns null when signed out", async () => {
    const res = await request(app).get("/api/auth/session");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
  });

  it("returns the signed-in user", async () => {
    const { agent } = await signedInAgent();
    const res = await agent.get("/api/auth/session");

    expect(res.body.user.username).toBe("alice");
  });

  it("treats an unknown token as signed out and clears the cookie", async () => {
    const res = await request(app)
      .get("/api/auth/session")
      .set("Cookie", `fw_session=${"x".repeat(43)}`);

    expect(res.body).toEqual({ user: null });
    expect(sessionSetCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("rejects and deletes expired sessions", async () => {
    const { cookie } = await signedInAgent();
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).get("/api/auth/session").set("Cookie", cookie);

    expect(res.body).toEqual({ user: null });
    expect(await prisma.session.count()).toBe(0);
  });

  it("extends a session that is close to expiring", async () => {
    const { cookie } = await signedInAgent();
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() + DAY_MS) } });

    const res = await request(app).get("/api/auth/session").set("Cookie", cookie);

    expect(res.body.user.username).toBe("alice");
    expect(sessionSetCookie(res)).toBeDefined();
    const session = await prisma.session.findFirstOrThrow();
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS);
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the session so the cookie can't be reused", async () => {
    const { agent, cookie } = await signedInAgent();

    const res = await agent.post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(sessionSetCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(await prisma.session.count()).toBe(0);

    const reused = await request(app).get("/api/auth/session").set("Cookie", cookie);
    expect(reused.body).toEqual({ user: null });
  });

  it("succeeds when already signed out", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(204);
  });
});

describe("PATCH /api/users/me (protected)", () => {
  it("requires a session", async () => {
    const res = await request(app).patch("/api/users/me").send({ displayName: "Mallory" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("updates the display name", async () => {
    const { agent } = await signedInAgent();

    const res = await agent.patch("/api/users/me").send({ displayName: "  Alice W.  " });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe("Alice W.");

    const session = await agent.get("/api/auth/session");
    expect(session.body.user.displayName).toBe("Alice W.");
  });

  it("validates the display name", async () => {
    const { agent } = await signedInAgent();
    const res = await agent.patch("/api/users/me").send({ displayName: "x".repeat(41) });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("displayName");
  });

  it("ignores fields that aren't editable", async () => {
    const { agent } = await signedInAgent();
    const res = await agent.patch("/api/users/me").send({ displayName: "Alice", username: "admin" });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("alice");
  });
});

describe("cross-origin protection", () => {
  it("rejects state-changing requests from another origin", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Origin", "https://evil.example")
      .send(testUser);

    expect(res.status).toBe(403);
    expect(await prisma.user.count()).toBe(0);
  });

  it("allows same-origin requests", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Host", "app.test")
      .set("Origin", "http://app.test")
      .send(testUser);

    expect(res.status).toBe(201);
  });
});

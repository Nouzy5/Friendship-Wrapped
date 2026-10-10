import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { setMailTransport, settleMail } from "../src/lib/mail.js";
import { resetRateLimits } from "../src/middleware/rate-limit.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { sha256Hex } from "../src/lib/tokens.js";
import {
  captureMail,
  mailTransportInto,
  resetDatabase,
  testUser,
  verificationTokenIn,
  verifyEmailNow,
  type SentMail,
} from "./helpers.js";

const app = createApp();
let mailbox: SentMail[];

beforeAll(() => {
  mailbox = captureMail();
});

beforeEach(async () => {
  await resetDatabase();
  resetRateLimits();
  mailbox.length = 0;
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

const CHROME_ON_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_ON_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** The mails sent so far (waits for the background sends to land first). */
async function sentMail(): Promise<SentMail[]> {
  await settleMail();
  return [...mailbox];
}

async function register(body: object = testUser, headers: Record<string, string> = {}) {
  return request(app).post("/api/auth/register").set(headers).send(body);
}

/** Signs `testUser` up and returns an agent holding their (unverified) session. */
async function signedUpAgent() {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send(testUser);
  expect(res.status).toBe(201);
  return { agent, userId: res.body.user.id as string };
}

describe("signing up", () => {
  it("requires an email address", async () => {
    const { email: _email, ...withoutEmail } = testUser;
    const res = await register(withoutEmail);

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain("email");
    expect(await prisma.user.count()).toBe(0);
  });

  it.each(["alice", "alice@", "@example.com", "alice@example", "a b@example.com", ""])(
    "rejects the email %j",
    async (email) => {
      const res = await register({ ...testUser, email });
      expect(res.status).toBe(400);
      expect(res.body.error.details[0].path).toBe("email");
    },
  );

  it("stores the address lowercased and unverified", async () => {
    const res = await register({ ...testUser, email: "  Alice@Example.COM " });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "alice@example.com", emailVerified: false });
    const user = await prisma.user.findUniqueOrThrow({ where: { username: "alice" } });
    expect(user.email).toBe("alice@example.com");
    expect(user.emailVerifiedAt).toBeNull();
  });

  it("refuses an address that someone has confirmed, whatever its case", async () => {
    await verifyEmailNow((await register()).body.user.id);
    const res = await register({ ...testUser, username: "alice2", email: "ALICE@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
    expect(res.body.error.details).toEqual([{ path: "email", message: "An account with that email already exists" }]);
    expect(await prisma.user.count()).toBe(1);
  });

  it("names both fields when both are taken", async () => {
    await verifyEmailNow((await register()).body.user.id);
    const res = await register();

    expect(res.status).toBe(409);
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(["email", "username"]);
  });

  it("emails a confirmation link to the address, and nobody else", async () => {
    await register();

    const mail = await sentMail();
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ to: "alice@example.com", subject: "Confirm your email for Friendship Wrapped" });
    expect(mail[0]!.text).toContain("/verify-email?token=");
    expect(mail[0]!.html).toContain("Confirm my email");
    // It goes to whatever address was typed in, so it says nothing about who signed up.
    expect(mail[0]!.text).not.toMatch(/alice/i);
    expect(mail[0]!.html).not.toMatch(/alice/i);
  });

  it("stores only a hash of the link's token", async () => {
    await register();
    const token = verificationTokenIn((await sentMail())[0]!);

    const row = await prisma.emailVerificationToken.findFirstOrThrow();
    expect(row.id).toBe(sha256Hex(token));
    expect(row.id).not.toContain(token);
    expect(row.email).toBe("alice@example.com");
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
  });

  it("doesn't call the first sign-in on this device new", async () => {
    await register();
    expect((await sentMail()).map((mail) => mail.subject)).toEqual(["Confirm your email for Friendship Wrapped"]);
    expect(await prisma.knownDevice.count()).toBe(1);
  });

  it("sets a device cookie", async () => {
    const res = await register();
    const cookies = (res.headers["set-cookie"] as unknown as string[]).filter((c) => c.startsWith("fw_device="));
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/HttpOnly/);
  });
});

describe("the email gate", () => {
  it("lets an unverified account see who it is, but nothing else", async () => {
    const { agent } = await signedUpAgent();

    const session = await agent.get("/api/auth/session");
    expect(session.body.user).toMatchObject({ username: "alice", emailVerified: false });

    for (const path of ["/api/groups", "/api/users/me/settings", "/api/notifications/status"]) {
      const res = await agent.get(path);
      expect(res.status, path).toBe(403);
      expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    }
    expect((await agent.post("/api/groups").send({ name: "The Boys", emoji: "🍻" })).status).toBe(403);
    expect((await agent.patch("/api/users/me").send({ displayName: "Mallory" })).status).toBe(403);
  });

  it("lets an unconfirmed account keep itself safe: password, other devices, leaving", async () => {
    const { agent } = await signedUpAgent();
    const other = request.agent(app);
    await other.post("/api/auth/login").send({ identifier: "alice", password: testUser.password });
    expect((await agent.get("/api/users/me/sessions")).body.sessions).toHaveLength(2);

    const changed = await agent
      .put("/api/users/me/password")
      .send({ currentPassword: testUser.password, newPassword: "a brand new password" });
    expect(changed.status).toBe(204);
    expect((await other.get("/api/auth/session")).body).toEqual({ user: null });

    expect((await agent.delete("/api/users/me/sessions")).status).toBe(204);
    expect((await agent.delete("/api/users/me").send({ password: "a brand new password" })).status).toBe(204);
    expect(await prisma.user.count()).toBe(0);
  });

  it("can still sign out", async () => {
    const { agent } = await signedUpAgent();
    expect((await agent.post("/api/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/auth/session")).body).toEqual({ user: null });
  });

  it("opens once the address is verified", async () => {
    const { agent, userId } = await signedUpAgent();
    expect((await agent.get("/api/groups")).status).toBe(403);

    await verifyEmailNow(userId);

    expect((await agent.get("/api/groups")).status).toBe(200);
    expect((await agent.get("/api/auth/session")).body.user.emailVerified).toBe(true);
  });

  it("still lets an unauthenticated visitor get a plain 401", async () => {
    const res = await request(app).get("/api/groups");
    expect(res.status).toBe(401);
  });

  it("holds accounts that have no email at all, and says to add one", async () => {
    const user = await prisma.user.create({
      data: { username: "oldtimer", displayName: "Old Timer", passwordHash: await hashPassword(testUser.password) },
    });
    expect(user.email).toBeNull();

    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ username: "oldtimer", password: testUser.password });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ email: null, emailVerified: false });

    const blocked = await agent.get("/api/groups");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toBe("Add your email address to continue");
  });
});

describe("who holds an address", () => {
  it("is whoever confirmed it: an account that only claimed it lets go when someone else asks", async () => {
    const squatter = request.agent(app);
    const claimed = await squatter.post("/api/auth/register").send(testUser);
    const squatterLink = verificationTokenIn((await sentMail())[0]!);
    mailbox.length = 0;

    const owner = await register({ ...testUser, username: "bob", displayName: "Bob" });
    expect(owner.status).toBe(201);
    expect(owner.body.user.email).toBe("alice@example.com");

    // The first account has no address any more, so its link is dead, and it's asked for one.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: claimed.body.user.id } })).email).toBeNull();
    expect((await request(app).post("/api/auth/verify-email").send({ token: squatterLink })).status).toBe(400);
    expect((await squatter.get("/api/auth/session")).body.user).toMatchObject({ email: null, emailVerified: false });

    // The new account's link works.
    const ownerLink = verificationTokenIn((await sentMail())[0]!);
    expect((await request(app).post("/api/auth/verify-email").send({ token: ownerLink })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { username: "bob" } })).emailVerifiedAt).not.toBeNull();
  });

  it("is kept by an account waiting for its link when a sign-up for it is turned away", async () => {
    const waiting = await register({ ...testUser, username: "carol", email: "carol@example.com" });
    const link = verificationTokenIn((await sentMail())[0]!);
    await register({ ...testUser, username: "bob", email: "bob@example.com" });

    // Someone asks for carol's address with a username that is taken: no account is made, so nothing is taken.
    const turnedAway = await register({ ...testUser, username: "bob", email: "carol@example.com" });
    expect(turnedAway.status).toBe(409);
    expect(turnedAway.body.error.code).toBe("USERNAME_TAKEN");

    expect((await prisma.user.findUniqueOrThrow({ where: { id: waiting.body.user.id } })).email).toBe("carol@example.com");
    expect(await prisma.user.count()).toBe(2);
    // ...and her link still works.
    expect((await request(app).post("/api/auth/verify-email").send({ token: link })).status).toBe(200);
  });

  it("is kept when a sign-up for it fails on the display name or the password, too", async () => {
    const waiting = await register({ ...testUser, username: "carol", email: "carol@example.com" });

    for (const bad of [{ displayName: "" }, { password: "short" }, { username: "no" }]) {
      expect((await register({ ...testUser, email: "carol@example.com", ...bad })).status).toBe(400);
    }

    expect((await prisma.user.findUniqueOrThrow({ where: { id: waiting.body.user.id } })).email).toBe("carol@example.com");
  });

  it("works the same when an account changes to an address someone only claimed", async () => {
    const claimed = await register({ ...testUser, username: "bob", email: "shared@example.com" });
    const { agent } = await signedUpAgent();

    const res = await agent.put("/api/auth/email").send({ email: "shared@example.com", password: testUser.password });

    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: claimed.body.user.id } })).email).toBeNull();
    expect(res.body.user.email).toBe("shared@example.com");
  });
});

describe("POST /api/auth/verify-email", () => {
  it("verifies the address with the link's token, once", async () => {
    const { agent, userId } = await signedUpAgent();
    const token = verificationTokenIn((await sentMail())[0]!);

    // Opened from a mail app: no session needed.
    const res = await request(app).post("/api/auth/verify-email").send({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: true, email: "alice@example.com" });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect((await agent.get("/api/groups")).status).toBe(200);
    expect(await prisma.emailVerificationToken.count()).toBe(0);

    const again = await request(app).post("/api/auth/verify-email").send({ token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("INVALID_LINK");
  });

  it("rejects a link that has expired", async () => {
    await register();
    const token = verificationTokenIn((await sentMail())[0]!);
    await prisma.emailVerificationToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post("/api/auth/verify-email").send({ token });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_LINK");
    expect((await prisma.user.findFirstOrThrow()).emailVerifiedAt).toBeNull();
  });

  it.each([{}, { token: "" }, { token: "short" }, { token: "x".repeat(43) }, { token: 42 }])(
    "rejects the token %j",
    async (body) => {
      const res = await request(app).post("/api/auth/verify-email").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_LINK");
    },
  );

  it("stops working once the person has changed their address", async () => {
    const { agent } = await signedUpAgent();
    const oldToken = verificationTokenIn((await sentMail())[0]!);

    const change = await agent.put("/api/auth/email").send({ email: "alice.new@example.com", password: testUser.password });
    expect(change.status).toBe(200);

    const res = await request(app).post("/api/auth/verify-email").send({ token: oldToken });
    expect(res.status).toBe(400);
    expect((await prisma.user.findFirstOrThrow()).emailVerifiedAt).toBeNull();
  });
});

describe("POST /api/auth/email/resend", () => {
  it("needs a session", async () => {
    expect((await request(app).post("/api/auth/email/resend")).status).toBe(401);
  });

  it("waits a minute between emails", async () => {
    const { agent } = await signedUpAgent();

    const res = await agent.post("/api/auth/email/resend");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("EMAIL_COOLDOWN");
    expect(res.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(await sentMail()).toHaveLength(1);
  });

  it("sends a new link, and the old one stops working", async () => {
    const { agent } = await signedUpAgent();
    const first = verificationTokenIn((await sentMail())[0]!);
    await prisma.emailVerificationToken.updateMany({ data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) } });

    const res = await agent.post("/api/auth/email/resend");
    expect(res.status).toBe(204);

    const mail = await sentMail();
    expect(mail).toHaveLength(2);
    const second = verificationTokenIn(mail[1]!);
    expect(second).not.toBe(first);
    expect(await prisma.emailVerificationToken.count()).toBe(1);

    expect((await request(app).post("/api/auth/verify-email").send({ token: first })).status).toBe(400);
    expect((await request(app).post("/api/auth/verify-email").send({ token: second })).status).toBe(200);
  });

  it("keeps the link that was working when a new one can't be sent", async () => {
    const { agent } = await signedUpAgent();
    const working = verificationTokenIn((await sentMail())[0]!);
    await prisma.emailVerificationToken.updateMany({ data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) } });
    setMailTransport({
      send: async () => {
        throw new Error("smtp is down");
      },
      verify: async () => {},
    });
    try {
      const res = await agent.post("/api/auth/email/resend");
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("EMAIL_SEND_FAILED");
    } finally {
      setMailTransport(mailTransportInto(mailbox));
    }

    expect(await prisma.emailVerificationToken.count()).toBe(1);
    expect((await request(app).post("/api/auth/verify-email").send({ token: working })).status).toBe(200);
  });

  it("does nothing for an address that's already verified", async () => {
    const { agent, userId } = await signedUpAgent();
    await verifyEmailNow(userId);
    mailbox.length = 0;

    expect((await agent.post("/api/auth/email/resend")).status).toBe(204);
    expect(await sentMail()).toHaveLength(0);
  });

  it("asks an account without an email to add one first", async () => {
    await prisma.user.create({
      data: { username: "oldtimer", displayName: "Old Timer", passwordHash: await hashPassword(testUser.password) },
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: "oldtimer", password: testUser.password });

    const res = await agent.post("/api/auth/email/resend");
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/auth/email", () => {
  it("adds an email to an account that has none, and sends it a link", async () => {
    await prisma.user.create({
      data: { username: "oldtimer", displayName: "Old Timer", passwordHash: await hashPassword(testUser.password) },
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: "oldtimer", password: testUser.password });

    const res = await agent.put("/api/auth/email").send({ email: "Old.Timer@Example.com", password: testUser.password });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "old.timer@example.com", emailVerified: false });

    const mail = await sentMail();
    expect(mail).toHaveLength(1);
    expect(mail[0]!.to).toBe("old.timer@example.com");

    await request(app).post("/api/auth/verify-email").send({ token: verificationTokenIn(mail[0]!) });
    expect((await agent.get("/api/groups")).status).toBe(200);
  });

  it("needs the right password", async () => {
    const { agent } = await signedUpAgent();
    const res = await agent.put("/api/auth/email").send({ email: "new@example.com", password: "not the password" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INCORRECT_PASSWORD");
    expect((await prisma.user.findFirstOrThrow()).email).toBe("alice@example.com");
  });

  it("refuses an address someone else has confirmed", async () => {
    await verifyEmailNow((await register({ ...testUser, username: "bob", email: "bob@example.com" })).body.user.id);
    const { agent } = await signedUpAgent();

    const res = await agent.put("/api/auth/email").send({ email: "BOB@example.com", password: testUser.password });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("makes a changed address unverified again, tells the old one, and mails the new one", async () => {
    const { agent, userId } = await signedUpAgent();
    await verifyEmailNow(userId);
    mailbox.length = 0;

    const res = await agent.put("/api/auth/email").send({ email: "alice.new@example.com", password: testUser.password });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "alice.new@example.com", emailVerified: false });

    const mail = await sentMail();
    expect(mail.map((m) => [m.to, m.subject]).sort()).toEqual([
      ["alice.new@example.com", "Confirm your email for Friendship Wrapped"],
      ["alice@example.com", "Your Friendship Wrapped email address was changed"],
    ]);
    expect((await agent.get("/api/groups")).status).toBe(403);
  });

  it("doesn't tell an old address that was never verified", async () => {
    const { agent } = await signedUpAgent();
    mailbox.length = 0;

    await agent.put("/api/auth/email").send({ email: "typo.fixed@example.com", password: testUser.password });
    expect((await sentMail()).map((m) => m.to)).toEqual(["typo.fixed@example.com"]);
  });

  it("says so when it's already the address", async () => {
    const { agent, userId } = await signedUpAgent();
    await verifyEmailNow(userId);

    const res = await agent.put("/api/auth/email").send({ email: "alice@example.com", password: testUser.password });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_UNCHANGED");
  });

  it("validates the address", async () => {
    const { agent } = await signedUpAgent();
    const res = await agent.put("/api/auth/email").send({ email: "nope", password: testUser.password });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("email");
  });
});

describe("signing in with an email", () => {
  beforeEach(async () => {
    await register();
  });

  it("accepts the address in any case, as `identifier`", async () => {
    const res = await request(app).post("/api/auth/login").send({ identifier: " Alice@EXAMPLE.com ", password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("alice");
  });

  it("still accepts the username, as `identifier` or the older `username`", async () => {
    for (const body of [{ identifier: "ALICE" }, { username: "alice" }, { username: "alice@example.com" }]) {
      const res = await request(app).post("/api/auth/login").send({ ...body, password: testUser.password });
      expect(res.status, JSON.stringify(body)).toBe(200);
    }
  });

  it("answers wrong passwords, unknown emails and unknown usernames the same way", async () => {
    const wrong = await request(app).post("/api/auth/login").send({ identifier: "alice@example.com", password: "nope nope nope" });
    const unknownEmail = await request(app).post("/api/auth/login").send({ identifier: "nobody@example.com", password: "nope nope nope" });
    const unknownName = await request(app).post("/api/auth/login").send({ identifier: "nobody", password: "nope nope nope" });

    for (const res of [wrong, unknownEmail, unknownName]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual(wrong.body);
    }
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("asks for an identifier", async () => {
    const res = await request(app).post("/api/auth/login").send({ password: testUser.password });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("identifier");
  });

  it("doesn't mistake an address that isn't one for a username", async () => {
    const res = await request(app).post("/api/auth/login").send({ identifier: "alice@", password: testUser.password });
    expect(res.status).toBe(401);
  });
});

describe("the new sign-in email", () => {
  const login = (headers: Record<string, string> = {}, identifier = "alice@example.com") =>
    request(app)
      .post("/api/auth/login")
      .set({ "User-Agent": CHROME_ON_WINDOWS, ...headers })
      .send({ identifier, password: testUser.password });

  async function verifiedAccount(headers: Record<string, string> = {}) {
    const res = await register(testUser, { "User-Agent": CHROME_ON_WINDOWS, ...headers });
    await verifyEmailNow(res.body.user.id);
    mailbox.length = 0;
  }

  it("goes to the verified address the first time a device signs in, naming the device", async () => {
    await verifiedAccount({ "X-Device-Id": "registration-device-0001" });

    expect((await login({ "X-Device-Id": "another-device-0000002" })).status).toBe(200);

    const mail = await sentMail();
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ to: "alice@example.com", subject: "New sign-in to your Friendship Wrapped account" });
    expect(mail[0]!.text).toContain("Chrome on Windows");
    expect(mail[0]!.text).toContain("/settings/account");
    expect(mail[0]!.html).toContain("Review my devices");
  });

  it("doesn't repeat for a device that has signed in before", async () => {
    await verifiedAccount({ "X-Device-Id": "registration-device-0001" });

    await login({ "X-Device-Id": "another-device-0000002" });
    await login({ "X-Device-Id": "another-device-0000002" });
    await login({ "X-Device-Id": "registration-device-0001" });

    expect(await sentMail()).toHaveLength(1);
  });

  it("tells each new device once", async () => {
    await verifiedAccount({ "X-Device-Id": "registration-device-0001" });

    await login({ "X-Device-Id": "device-two-0000000002", "User-Agent": SAFARI_ON_IPHONE });
    await login({ "X-Device-Id": "device-three-00000003" });

    const mail = await sentMail();
    expect(mail).toHaveLength(2);
    expect(mail[0]!.text).toContain("Safari on iPhone");
    expect(await prisma.knownDevice.count()).toBe(3);
  });

  it("recognises a browser by its device cookie", async () => {
    await verifiedAccount();
    const browser = request.agent(app).set("User-Agent", SAFARI_ON_IPHONE);

    await browser.post("/api/auth/login").send({ identifier: "alice@example.com", password: testUser.password });
    expect(await sentMail()).toHaveLength(1);

    await browser.post("/api/auth/logout");
    await browser.post("/api/auth/login").send({ identifier: "alice@example.com", password: testUser.password });
    expect(await sentMail()).toHaveLength(1);
  });

  it("treats a client with no device id as new every time", async () => {
    await verifiedAccount({ "X-Device-Id": "registration-device-0001" });

    await request(app).post("/api/auth/login").send({ identifier: "alice@example.com", password: testUser.password });
    await request(app).post("/api/auth/login").send({ identifier: "alice@example.com", password: testUser.password });

    expect(await sentMail()).toHaveLength(2);
  });

  it("ignores a malformed device id", async () => {
    await verifiedAccount({ "X-Device-Id": "registration-device-0001" });

    await login({ "X-Device-Id": "short" });
    await login({ "X-Device-Id": "short" });
    expect(await sentMail()).toHaveLength(2);
  });

  it("is not sent to an address that was never verified", async () => {
    await register(testUser, { "X-Device-Id": "registration-device-0001" });
    mailbox.length = 0;

    expect((await login({ "X-Device-Id": "another-device-0000002" })).status).toBe(200);
    expect(await sentMail()).toHaveLength(0);
  });

  it("is not sent for a failed sign-in", async () => {
    await verifiedAccount({ "X-Device-Id": "registration-device-0001" });

    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Device-Id", "another-device-0000002")
      .send({ identifier: "alice@example.com", password: "wrong password!" });
    expect(res.status).toBe(401);
    expect(await sentMail()).toHaveLength(0);
  });

  it("keeps at most fifty devices per person", async () => {
    await verifiedAccount({ "X-Device-Id": "registration-device-0001" });
    const user = await prisma.user.findFirstOrThrow();
    await prisma.knownDevice.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        userId: user.id,
        id: sha256Hex(`filler-${index}`),
        label: "Filler",
        lastSeenAt: new Date(Date.now() - (index + 1) * 60_000),
      })),
    });

    await login({ "X-Device-Id": "another-device-0000002" });

    expect(await prisma.knownDevice.count()).toBe(50);
    expect(await prisma.knownDevice.count({ where: { id: sha256Hex("another-device-0000002") } })).toBe(1);
  });

  it("still signs in when the list of devices can't be updated, without calling it new", async () => {
    await verifiedAccount({ "X-Device-Id": "registration-device-0001" });
    const broken = vi.spyOn(prisma.knownDevice, "updateMany").mockRejectedValueOnce(new Error("database went away"));
    try {
      const res = await login({ "X-Device-Id": "another-device-0000002" });
      expect(res.status).toBe(200);
      expect(await sentMail()).toHaveLength(0);
    } finally {
      broken.mockRestore();
    }
  });

  it("goes to nobody when the mail server is down, and the sign-in still works", async () => {
    await verifiedAccount({ "X-Device-Id": "registration-device-0001" });
    setMailTransport({
      send: async () => {
        throw new Error("connection refused");
      },
      verify: async () => {},
    });
    try {
      const res = await login({ "X-Device-Id": "another-device-0000002" });
      expect(res.status).toBe(200);
      await settleMail();
    } finally {
      setMailTransport(mailTransportInto(mailbox));
    }
  });
});

describe("deleting an account", () => {
  it("removes its links and devices with it", async () => {
    const { agent, userId } = await signedUpAgent();
    expect(await prisma.emailVerificationToken.count()).toBe(1);
    expect(await prisma.knownDevice.count()).toBe(1);
    await verifyEmailNow(userId);

    const res = await agent.delete("/api/users/me").send({ password: testUser.password });
    expect(res.status).toBe(204);
    expect(await prisma.emailVerificationToken.count()).toBe(0);
    expect(await prisma.knownDevice.count()).toBe(0);
  });
});

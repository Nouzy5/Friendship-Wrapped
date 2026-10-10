import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { setMailTransport, settleMail } from "../src/lib/mail.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { sha256Hex } from "../src/lib/tokens.js";
import { resetRateLimits } from "../src/middleware/rate-limit.js";
import { RESET_COOLDOWN_MS, RESET_TTL_MS } from "../src/modules/auth/password-reset.service.js";
import {
  captureMail,
  mailTransportInto,
  resetDatabase,
  resetTokenIn,
  signUp,
  testUser,
  verificationTokenIn,
  type SentMail,
} from "./helpers.js";

const app = createApp();
let mailbox: SentMail[];

const RESET_SUBJECT = "Reset your Friendship Wrapped password";
const CHANGED_SUBJECT = "Your Friendship Wrapped password was changed";
const NEW_PASSWORD = "a brand new passphrase";

beforeAll(() => {
  mailbox = captureMail();
});

beforeEach(async () => {
  await resetDatabase();
  resetRateLimits();
  mailbox.length = 0;
});

afterEach(() => {
  // Some tests turn mail off or break it.
  setMailTransport(mailTransportInto(mailbox));
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

/** The mails with this subject sent so far (waits for the background sends to land first). */
async function mailsWith(subject: string): Promise<SentMail[]> {
  await settleMail();
  return mailbox.filter((mail) => mail.subject === subject);
}

const forgot = (identifier: unknown) => request(app).post("/api/auth/forgot-password").send({ identifier });
const check = (token: unknown) => request(app).post("/api/auth/reset-password/check").send({ token });
const reset = (token: unknown, newPassword: unknown = NEW_PASSWORD) =>
  request(app).post("/api/auth/reset-password").send({ token, newPassword });
const login = (identifier: string, password: string) =>
  request(app).post("/api/auth/login").send({ identifier, password });

/** Asks for a link for the account and returns the token from the email it was sent in. */
async function requestLink(identifier = "alice"): Promise<string> {
  const before = (await mailsWith(RESET_SUBJECT)).length;
  expect((await forgot(identifier)).status).toBe(204);
  const mails = await mailsWith(RESET_SUBJECT);
  expect(mails.length, "a reset email should have been sent").toBe(before + 1);
  return resetTokenIn(mails[mails.length - 1]!);
}

/** Lets the next request for this account's link through (there's a wait between two). */
const skipCooldown = (userId: string) =>
  prisma.passwordResetToken.updateMany({
    where: { userId },
    data: { createdAt: new Date(Date.now() - RESET_COOLDOWN_MS - 5000) },
  });

/** An account that signed up and has not opened the confirmation link, and is signed out. */
async function unconfirmedAccount() {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send(testUser);
  expect(res.status).toBe(201);
  await agent.post("/api/auth/logout");
  mailbox.length = 0;
  return res.body.user.id as string;
}

describe("POST /api/auth/forgot-password", () => {
  it("emails a link to the address on the account, found by email or by username, in any case", async () => {
    await signUp(app, "alice");
    mailbox.length = 0;

    for (const identifier of ["alice", "ALICE", "  Alice  ", "alice@example.com", "Alice@Example.COM"]) {
      await prisma.passwordResetToken.deleteMany();
      mailbox.length = 0;
      expect((await forgot(identifier)).status, identifier).toBe(204);

      const mails = await mailsWith(RESET_SUBJECT);
      expect(mails, identifier).toHaveLength(1);
      expect(mails[0]!.to).toBe("alice@example.com");
    }
  });

  it("gives the same answer whether or not there is such an account", async () => {
    await signUp(app, "alice");
    await prisma.user.create({
      data: { username: "oldtimer", displayName: "Old", passwordHash: await hashPassword(testUser.password) },
    });
    mailbox.length = 0;

    const known = await forgot("alice");
    for (const identifier of ["nobody", "nobody@example.com", "oldtimer", "not an email@", "@", "álice", "a@b"]) {
      const res = await forgot(identifier);
      expect(res.status, identifier).toBe(known.status);
      expect(res.text, identifier).toBe(known.text);
      expect(res.headers["set-cookie"], identifier).toBeUndefined();
    }
    // Only the one real account got mail: not the unknown names, and not the account with no address.
    expect(await mailsWith(RESET_SUBJECT)).toHaveLength(1);
    expect(await prisma.passwordResetToken.count()).toBe(1);
  });

  it("works for an account whose email was never confirmed, and for someone who isn't signed in", async () => {
    await unconfirmedAccount();

    expect((await forgot("alice")).status).toBe(204);
    expect(await mailsWith(RESET_SUBJECT)).toHaveLength(1);
  });

  it("works while signed in to another account", async () => {
    const bob = await signUp(app, "bob");
    await signUp(app, "alice");
    mailbox.length = 0;

    expect((await bob.agent.post("/api/auth/forgot-password").send({ identifier: "alice" })).status).toBe(204);
    expect((await mailsWith(RESET_SUBJECT))[0]!.to).toBe("alice@example.com");
  });

  it("says nothing about whose account it is in the email", async () => {
    await signUp(app, "alice");
    mailbox.length = 0;
    await forgot("alice");

    const [mail] = await mailsWith(RESET_SUBJECT);
    expect(mail!.text).toContain("/reset-password?token=");
    expect(mail!.html).toContain("Choose a new password");
    expect(mail!.text).not.toMatch(/alice/i);
    expect(mail!.html).not.toMatch(/alice/i);
  });

  it("stores only a hash of the token, tied to the address, for an hour", async () => {
    await signUp(app, "alice");
    const token = await requestLink();

    const row = await prisma.passwordResetToken.findFirstOrThrow();
    expect(row.id).toBe(sha256Hex(token));
    expect(row.id).not.toContain(token);
    expect(row.email).toBe("alice@example.com");
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + RESET_TTL_MS - 60_000);
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + RESET_TTL_MS);
  });

  it("sends one email a minute, and answers the same when it doesn't", async () => {
    const { user } = await signUp(app, "alice");
    mailbox.length = 0;

    expect((await forgot("alice")).status).toBe(204);
    const again = await forgot("alice");
    expect(again.status).toBe(204);
    expect(await mailsWith(RESET_SUBJECT)).toHaveLength(1);

    await skipCooldown(user.id);
    expect((await forgot("alice")).status).toBe(204);
    expect(await mailsWith(RESET_SUBJECT)).toHaveLength(2);
  });

  it("keeps the earlier link working when another is asked for, and one use ends them all", async () => {
    const { user } = await signUp(app, "alice");
    mailbox.length = 0;
    const first = await requestLink();
    await skipCooldown(user.id);
    const second = await requestLink();
    expect(second).not.toBe(first);

    // A stranger asking again must not cancel the link its owner is about to open.
    expect((await check(first)).status).toBe(204);
    expect((await check(second)).status).toBe(204);

    expect((await reset(second)).status).toBe(204);
    expect((await check(first)).status).toBe(400);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("is not stopped by a mail server that is down: the answer is the same and the link exists", async () => {
    await signUp(app, "alice");
    setMailTransport({
      send: async () => {
        throw new Error("connection refused");
      },
      verify: async () => {},
    });

    expect((await forgot("alice")).status).toBe(204);
    await settleMail();
    expect(await prisma.passwordResetToken.count()).toBe(1);
  });

  it("answers the same with mail turned off", async () => {
    await signUp(app, "alice");
    setMailTransport(null);

    expect((await forgot("alice")).status).toBe(204);
  });

  it.each([
    ["no identifier", {}],
    ["a number", { identifier: 123 }],
    ["an object", { identifier: { $ne: "" } }],
    ["an array", { identifier: ["alice"] }],
    ["an empty string", { identifier: "" }],
    ["only spaces", { identifier: "   " }],
    ["a very long string", { identifier: "a".repeat(300) }],
  ])("rejects %s as a request", async (_name, body) => {
    const res = await request(app).post("/api/auth/forgot-password").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("identifier");
    expect(await mailsWith(RESET_SUBJECT)).toHaveLength(0);
  });

  it("rejects a body that isn't JSON", async () => {
    const res = await request(app).post("/api/auth/forgot-password").set("Content-Type", "application/json").send("{nope");
    expect(res.status).toBe(400);
  });

  it("limits how many a single name can ask for, whether or not it's an account", async () => {
    await signUp(app, "alice");

    const answers = async (name: string) => {
      const out: number[] = [];
      for (let i = 0; i < 7; i++) out.push((await forgot(name)).status);
      return out;
    };
    // Turned away at the sixth, and the same for a name nobody has: it says nothing about who does.
    expect(await answers("alice")).toEqual([204, 204, 204, 204, 204, 429, 429]);
    resetRateLimits(); // (the per-address limit is another test's business)
    expect(await answers("nobody")).toEqual([204, 204, 204, 204, 204, 429, 429]);
  });

  it("limits how many one address can ask for, whichever names it uses", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await forgot(`name${i}`)).status);
    expect(statuses).toEqual([...Array(10).fill(204), 429, 429]);
  });
});

describe("POST /api/auth/reset-password/check", () => {
  it("says whether a link still works, and changes nothing", async () => {
    await signUp(app, "alice");
    const token = await requestLink();

    expect((await check(token)).status).toBe(204);
    expect((await check(token)).status).toBe(204);
    expect(await prisma.passwordResetToken.count()).toBe(1);
    expect((await reset(token)).status).toBe(204);
  });

  it.each([
    ["missing", undefined],
    ["not a string", 12],
    ["too short", "abc"],
    ["too long", "a".repeat(44)],
    ["not base64url", `${"a".repeat(42)}!`],
    ["unknown", "A".repeat(43)],
  ])("refuses a token that is %s", async (_name, token) => {
    const res = await check(token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_LINK");
  });

  it("refuses an expired link", async () => {
    await signUp(app, "alice");
    const token = await requestLink();
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await check(token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_LINK");
  });

  it("refuses a confirmation link: the two kinds don't mix", async () => {
    await request(app).post("/api/auth/register").send(testUser);
    const confirmation = verificationTokenIn((await mailsWith("Confirm your email for Friendship Wrapped"))[0]!);

    expect((await check(confirmation)).status).toBe(400);
    expect((await reset(confirmation)).status).toBe(400);
  });

  it("is limited per address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) statuses.push((await check("A".repeat(43))).status);
    expect(statuses.filter((status) => status === 400)).toHaveLength(30);
    expect(statuses.slice(30)).toEqual([429, 429]);
  });
});

describe("POST /api/auth/reset-password", () => {
  it("sets the new password: the old one stops working and the new one logs in, by email or username", async () => {
    await signUp(app, "alice");
    const token = await requestLink();

    const res = await reset(token);
    expect(res.status).toBe(204);

    expect((await login("alice", testUser.password)).status).toBe(401);
    expect((await login("alice", NEW_PASSWORD)).status).toBe(200);
    expect((await login("alice@example.com", NEW_PASSWORD)).status).toBe(200);
  });

  it("does not sign anyone in", async () => {
    await signUp(app, "alice");
    const token = await requestLink();

    const res = await reset(token);
    expect(res.headers["set-cookie"]).toBeUndefined();
    // The session from signing up is gone, and none was made.
    expect(await prisma.session.count()).toBe(0);
  });

  it("signs out every device, including the one that asked", async () => {
    const { agent } = await signUp(app, "alice");
    const other = request.agent(app);
    await other.post("/api/auth/login").send({ identifier: "alice", password: testUser.password });
    const token = await requestLink();

    expect((await reset(token)).status).toBe(204);

    expect((await agent.get("/api/auth/session")).body).toEqual({ user: null });
    expect((await other.get("/api/auth/session")).body).toEqual({ user: null });
    expect((await agent.get("/api/groups")).status).toBe(401);
  });

  it("works from a browser that is signed in, and doesn't touch other people's sessions", async () => {
    const alice = await signUp(app, "alice");
    const bob = await signUp(app, "bob");
    const token = await requestLink("alice");

    // Bob's browser opens Alice's link.
    expect((await bob.agent.post("/api/auth/reset-password").send({ token, newPassword: NEW_PASSWORD })).status).toBe(204);

    expect((await bob.agent.get("/api/auth/session")).body.user.username).toBe("bob");
    expect((await alice.agent.get("/api/auth/session")).body.user).toBeNull();
  });

  it("can be used once", async () => {
    await signUp(app, "alice");
    const token = await requestLink();

    expect((await reset(token)).status).toBe(204);
    const again = await reset(token, "another passphrase here");
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("INVALID_LINK");
    expect((await login("alice", "another passphrase here")).status).toBe(401);
    expect((await login("alice", NEW_PASSWORD)).status).toBe(200);
  });

  it("can be used only once when sent twice at the same moment", async () => {
    await signUp(app, "alice");
    const token = await requestLink();

    const results = await Promise.all([
      reset(token, "first passphrase wins"),
      reset(token, "second passphrase wins"),
      reset(token, "third passphrase wins"),
    ]);

    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([204, 400, 400]);
    // Whichever got there first is the password, and exactly one email says so.
    const winner = ["first", "second", "third"][results.findIndex((res) => res.status === 204)]!;
    expect((await login("alice", `${winner} passphrase wins`)).status).toBe(200);
    expect(await mailsWith(CHANGED_SUBJECT)).toHaveLength(1);
  });

  it("refuses a weak or oversized password and leaves the link working", async () => {
    await signUp(app, "alice");
    const token = await requestLink();

    for (const bad of ["short", "", "a".repeat(129), 12345678, null, undefined]) {
      // Sent as it is (the `reset` helper would fill in a missing password).
      const res = await request(app).post("/api/auth/reset-password").send({ token, newPassword: bad });
      expect(res.status, String(bad)).toBe(400);
      expect(res.body.error.details[0].path).toBe("newPassword");
    }
    // Still the old password, and the link still works.
    expect((await login("alice", testUser.password)).status).toBe(200);
    expect((await check(token)).status).toBe(204);
    expect((await reset(token)).status).toBe(204);
  });

  it("accepts the longest and the strangest allowed passwords", async () => {
    await signUp(app, "alice");
    for (const password of ["a".repeat(128), "pässwörd 🔥 with spaces and 日本語", "        "]) {
      const token = await requestLink();
      expect((await reset(token, password)).status, password).toBe(204);
      expect((await login("alice", password)).status, password).toBe(200);
      await skipCooldown((await prisma.user.findUniqueOrThrow({ where: { username: "alice" } })).id);
    }
  });

  it("refuses an unknown, malformed or expired link without changing anything", async () => {
    const { user } = await signUp(app, "alice");
    const token = await requestLink();

    for (const bad of ["A".repeat(43), "short", undefined, 5]) {
      const res = await reset(bad);
      expect(res.status, String(bad)).toBe(400);
      expect(res.body.error.code).toBe("INVALID_LINK");
    }

    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await reset(token);
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe("INVALID_LINK");

    expect((await login("alice", testUser.password)).status).toBe(200);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBeGreaterThan(0);
    expect(await mailsWith(CHANGED_SUBJECT)).toHaveLength(0);
  });

  it("tells the person by email that the password was changed, without a link that resets it", async () => {
    await signUp(app, "alice");
    const token = await requestLink();
    mailbox.length = 0;

    await reset(token);

    const mails = await mailsWith(CHANGED_SUBJECT);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe("alice@example.com");
    expect(mails[0]!.text).toContain("Alice");
    expect(mails[0]!.text).not.toContain(token);
    expect(mails[0]!.text).not.toContain("reset-password");
  });

  it("confirms an address that was never confirmed (the link proved the inbox is theirs), and lets them in", async () => {
    const userId = await unconfirmedAccount();
    const token = await requestLink();

    expect((await reset(token)).status).toBe(204);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(await prisma.emailVerificationToken.count({ where: { userId } })).toBe(0);

    const agent = request.agent(app);
    const signedIn = await agent.post("/api/auth/login").send({ identifier: "alice", password: NEW_PASSWORD });
    expect(signedIn.body.user.emailVerified).toBe(true);
    expect((await agent.get("/api/groups")).status).toBe(200);
  });

  it("leaves an address that was already confirmed as it was", async () => {
    const { user } = await signUp(app, "alice");
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt;
    const token = await requestLink();

    await reset(token);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toEqual(before);
  });

  it("refuses a link for an address the account no longer has", async () => {
    const { agent, user } = await signUp(app, "alice");
    const token = await requestLink();

    // Straight in the database, to test the link's own check (changing it through the API also ends the links).
    await prisma.user.update({ where: { id: user.id }, data: { email: "new@example.com", emailVerifiedAt: null } });

    expect((await check(token)).status).toBe(400);
    expect((await reset(token)).status).toBe(400);
    expect((await login("alice", testUser.password)).status).toBe(200);
    expect((await agent.get("/api/auth/session")).body.user).not.toBeNull();
  });

  it("is dead once the address is given up to whoever confirmed it", async () => {
    const userId = await unconfirmedAccount();
    const token = await requestLink();

    // Someone else signs up with the address and takes it over.
    await request(app).post("/api/auth/register").send({ ...testUser, username: "bob", displayName: "Bob" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email).toBeNull();

    expect((await check(token)).status).toBe(400);
    expect((await reset(token)).status).toBe(400);
    // Bob's account was not touched.
    expect((await login("bob", testUser.password)).status).toBe(200);
  });

  it("is ended when the address is changed, so it can't come back if the address is changed back", async () => {
    const { agent } = await signUp(app, "alice");
    const token = await requestLink();

    expect((await agent.put("/api/auth/email").send({ email: "new@example.com", password: testUser.password })).status).toBe(200);
    expect(await prisma.passwordResetToken.count()).toBe(0);
    expect((await agent.put("/api/auth/email").send({ email: "alice@example.com", password: testUser.password })).status).toBe(200);

    expect((await check(token)).status).toBe(400);
  });

  it("is ended when the password is changed from settings", async () => {
    const { agent } = await signUp(app, "alice");
    const token = await requestLink();

    const changed = await agent
      .put("/api/users/me/password")
      .send({ currentPassword: testUser.password, newPassword: "changed from settings" });
    expect(changed.status).toBe(204);

    expect((await check(token)).status).toBe(400);
    expect((await login("alice", "changed from settings")).status).toBe(200);
  });

  it("goes when the account is deleted, and a link to a deleted account does nothing", async () => {
    const { agent } = await signUp(app, "alice");
    const token = await requestLink();

    expect((await agent.delete("/api/users/me").send({ password: testUser.password })).status).toBe(204);

    expect(await prisma.passwordResetToken.count()).toBe(0);
    expect((await reset(token)).status).toBe(400);
  });

  it("lets accounts with no email alone: there's nowhere to send a link, and no link to use", async () => {
    await prisma.user.create({
      data: { username: "oldtimer", displayName: "Old", passwordHash: await hashPassword(testUser.password) },
    });

    expect((await forgot("oldtimer")).status).toBe(204);
    expect(await prisma.passwordResetToken.count()).toBe(0);
    expect((await login("oldtimer", testUser.password)).status).toBe(200);
  });

  it("is limited per address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) statuses.push((await reset("A".repeat(43))).status);
    expect(statuses.slice(30)).toEqual([429, 429]);
  });

});

describe("the admin's address", () => {
  // An address on ADMIN_EMAILS is only confirmed from a browser signed in to the account that has it
  // (see the confirmation link). A reset link is different: it's opened by whoever reads the inbox, and
  // it takes the account away from whoever knew the old password, so squatting on the address gains nothing.
  it("gives a squatted admin address to the inbox's owner, and takes it from the squatter", async () => {
    const squatter = request.agent(app);
    const signedUp = await squatter
      .post("/api/auth/register")
      .send({ ...testUser, email: "admin@example.com", username: "squatter", displayName: "Squatter" });
    expect(signedUp.status).toBe(201);
    expect(signedUp.body.user).toMatchObject({ emailVerified: false, isAdmin: false });

    // The owner, who reads that inbox, asks for a link and chooses a password.
    const token = await requestLink("admin@example.com");
    expect((await reset(token)).status).toBe(204);

    // The squatter has nothing left: no session, and the password they knew is gone.
    expect((await squatter.get("/api/auth/session")).body.user).toBeNull();
    expect((await login("squatter", testUser.password)).status).toBe(401);

    const owner = request.agent(app);
    const signedIn = await owner.post("/api/auth/login").send({ identifier: "admin@example.com", password: NEW_PASSWORD });
    expect(signedIn.body.user).toMatchObject({ emailVerified: true, isAdmin: true });
    expect((await owner.get("/api/admin/overview")).status).toBe(200);
  });

  it("can't be used by the squatter to get in: the link only ever goes to the inbox", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ ...testUser, email: "admin@example.com", username: "squatter", displayName: "Squatter" });
    mailbox.length = 0;

    // Whoever asks, the answer is the same and the link isn't in it.
    const res = await forgot("squatter");
    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect((await mailsWith(RESET_SUBJECT))[0]!.to).toBe("admin@example.com");
  });
});

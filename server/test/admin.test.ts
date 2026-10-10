import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { logger } from "../src/lib/logger.js";
import { setMailTransport, settleMail } from "../src/lib/mail.js";
import { prisma } from "../src/lib/prisma.js";
import { resetRateLimits } from "../src/middleware/rate-limit.js";
import {
  captureMail,
  createGroup,
  groupWith,
  mailTransportInto,
  resetDatabase,
  resetStorage,
  signUp,
  testUser,
  uploadPhoto,
  verificationTokenIn,
  type Agent,
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
  setMailTransport(mailTransportInto(mailbox));
});

afterAll(async () => {
  await resetDatabase();
  await resetStorage();
  await prisma.$disconnect();
});

/** The one account ADMIN_EMAILS (see vitest.config.ts) lets in: admin@example.com, verified. */
async function signUpAdmin() {
  const admin = await signUp(app, "admin");
  // Signing up sent a confirmation email: not what the test is about.
  await settleMail();
  mailbox.length = 0;
  return admin;
}

describe("who gets in", () => {
  it("turns signed-out visitors away with a 401", async () => {
    expect((await request(app).get("/api/admin/overview")).status).toBe(401);
  });

  it("makes everyone else's admin panel not exist", async () => {
    const { agent } = await signUp(app, "alice");

    for (const path of ["/overview", "/users", "/groups", "/reports", "/system"]) {
      const res = await agent.get(`/api/admin${path}`);
      expect(res.status, path).toBe(404);
    }
    expect((await agent.post("/api/admin/system/test-email")).status).toBe(404);
  });

  it("lets the verified owner in, and tells the client so", async () => {
    const { agent } = await signUpAdmin();

    expect((await agent.get("/api/admin/overview")).status).toBe(200);
    expect((await agent.get("/api/auth/session")).body.user.isAdmin).toBe(true);
  });

  it("doesn't tell anyone else they're an admin", async () => {
    const { agent } = await signUp(app, "alice");
    expect((await agent.get("/api/auth/session")).body.user.isAdmin).toBe(false);
  });

  it("keeps out an account that registered the admin's address but never confirmed it", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/register").send({ ...testUser, username: "admin", email: "admin@example.com" });
    expect(res.body.user.isAdmin).toBe(false);

    const blocked = await agent.get("/api/admin/overview");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("doesn't make someone an admin by changing their address to the admin's until they confirm it", async () => {
    const { agent } = await signUp(app, "alice");

    const change = await agent.put("/api/auth/email").send({ email: "Admin@Example.com", password: testUser.password });
    expect(change.status).toBe(200);
    expect(change.body.user.isAdmin).toBe(false);
    expect((await agent.get("/api/admin/overview")).status).toBe(403);

    await settleMail();
    const token = verificationTokenIn(mailbox.find((mail) => mail.to === "admin@example.com")!);
    // An admin address is only confirmed by someone signed in to the account that has it.
    expect((await agent.post("/api/auth/verify-email").send({ token })).status).toBe(200);

    // Whoever really owns that inbox is the admin: that is what verification is for.
    expect((await agent.get("/api/auth/session")).body.user.isAdmin).toBe(true);
    expect((await agent.get("/api/admin/overview")).status).toBe(200);
  });
});

describe("the admin address", () => {
  it("is confirmed only by someone signed in to the account that has it", async () => {
    const owner = request.agent(app);
    const registered = await owner.post("/api/auth/register").send({ ...testUser, username: "owner", email: "admin@example.com" });
    await settleMail();
    const token = verificationTokenIn(mailbox.find((mail) => mail.to === "admin@example.com")!);

    // Opened from a mail app, or by a scanner that runs scripts: nobody is signed in.
    const anonymous = await request(app).post("/api/auth/verify-email").send({ token });
    expect(anonymous.status).toBe(403);
    expect(anonymous.body.error.code).toBe("SIGN_IN_TO_CONFIRM");
    // Signed in as somebody else.
    const { agent: someone } = await signUp(app, "carol");
    expect((await someone.post("/api/auth/verify-email").send({ token })).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: registered.body.user.id } })).emailVerifiedAt).toBeNull();

    // Signed in as the account itself.
    expect((await owner.post("/api/auth/verify-email").send({ token })).status).toBe(200);
    expect((await owner.get("/api/auth/session")).body.user.isAdmin).toBe(true);
  });

  it("can't be taken by signing up with it first", async () => {
    const squatter = await request(app).post("/api/auth/register").send({ ...testUser, username: "squatter", email: "admin@example.com" });
    await settleMail();
    const squatterLink = verificationTokenIn(mailbox.find((mail) => mail.to === "admin@example.com")!);
    mailbox.length = 0;

    // The owner opens the link they were sent: they aren't signed in as the squatter, so it does nothing.
    expect((await request(app).post("/api/auth/verify-email").send({ token: squatterLink })).status).toBe(403);

    // Signing up with their own address takes it back from the squatter, who never confirmed it.
    const owner = request.agent(app);
    expect((await owner.post("/api/auth/register").send({ ...testUser, username: "owner", email: "admin@example.com" })).status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: squatter.body.user.id } })).email).toBeNull();
    await settleMail();
    const ownerLink = verificationTokenIn(mailbox.find((mail) => mail.to === "admin@example.com")!);
    expect((await owner.post("/api/auth/verify-email").send({ token: ownerLink })).status).toBe(200);
    expect((await owner.get("/api/admin/overview")).status).toBe(200);
  });

  it("is never marked confirmed from the admin panel", async () => {
    const squatter = await prisma.user.create({
      data: { username: "squatter", displayName: "Squatter", passwordHash: "x", email: "admin@example.com" },
    });
    const { markEmailVerified } = await import("../src/modules/admin/admin.service.js");

    await expect(markEmailVerified("@admin", squatter.id)).rejects.toMatchObject({ status: 400 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: squatter.id } })).emailVerifiedAt).toBeNull();
  });
});

describe("GET /api/admin/overview", () => {
  it("counts people, groups and what they've shared", async () => {
    const { agent: admin } = await signUpAdmin();
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const photo = await uploadPhoto(owner.agent, group.id);
    await uploadPhoto(bob.agent, group.id);
    await bob.agent.put(`/api/photos/${photo.id}/reaction`).send({ type: "HEART" });
    await bob.agent.post(`/api/photos/${photo.id}/comments`).send({ body: "🔥" });
    await bob.agent.post("/api/reports").send({ userId: owner.user.id, message: "just testing" });
    await prisma.user.create({ data: { username: "ghost", displayName: "Ghost", passwordHash: "x" } });
    await prisma.user.update({ where: { id: bob.user.id }, data: { emailVerifiedAt: null } });

    const res = await admin.get("/api/admin/overview");

    expect(res.status).toBe(200);
    expect(res.body.users).toMatchObject({ total: 4, verified: 2, unverified: 1, withoutEmail: 1, newLast7Days: 4, newLast30Days: 4 });
    expect(res.body.users.active.last24Hours).toBeGreaterThanOrEqual(1);
    expect(res.body.groups.total).toBe(1);
    expect(res.body.content).toMatchObject({ photos: 2, videos: 0, comments: 1, reactions: 1 });
    expect(res.body.content.storageBytes).toBeGreaterThan(0);
    expect(res.body.safety.reports).toBe(1);
  });

  it("has thirty days of daily counts, ending today", async () => {
    const { agent: admin } = await signUpAdmin();
    const { owner, group } = await groupWith(app, "alice");
    await uploadPhoto(owner.agent, group.id);

    const { daily } = (await admin.get("/api/admin/overview")).body;

    const today = new Date().toISOString().slice(0, 10);
    expect(daily.signups).toHaveLength(30);
    expect(daily.signups.at(-1)).toEqual({ date: today, count: 2 });
    expect(daily.posts).toHaveLength(30);
    expect(daily.posts.at(-1)).toEqual({ date: today, count: 1 });
    expect(daily.signups[0].count).toBe(0);
    const dates: string[] = daily.signups.map((day: { date: string }) => day.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(30);
  });
});

describe("users", () => {
  async function seed() {
    const admin = await signUpAdmin();
    const alice = await signUp(app, "alice");
    const bob = await signUp(app, "bob");
    await prisma.user.update({ where: { id: alice.user.id }, data: { displayName: "Alice Wonderland" } });
    // Spread the sign-up dates so the order is certain.
    for (const [index, { user }] of [admin, alice, bob].entries()) {
      await prisma.user.update({ where: { id: user.id }, data: { createdAt: new Date(Date.now() - (3 - index) * 60_000) } });
    }
    return { admin, alice, bob };
  }

  it("lists people, newest first, without anything secret", async () => {
    const { admin } = await seed();

    const res = await admin.agent.get("/api/admin/users");

    expect(res.status).toBe(200);
    expect(res.body.users.map((user: { username: string }) => user.username)).toEqual(["bob", "alice", "admin"]);
    expect(res.body.users[0]).toEqual({
      id: expect.any(String),
      username: "bob",
      displayName: "Bob",
      email: "bob@example.com",
      emailVerified: true,
      isAdmin: false,
      createdAt: expect.any(String),
      lastActiveAt: expect.any(String),
      groupCount: 0,
      photoCount: 0,
    });
    expect(res.body.users.find((user: { username: string }) => user.username === "admin").isAdmin).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);
    expect(res.body.nextCursor).toBeNull();
  });

  it.each([
    ["a username", "ali", ["alice"]],
    ["a display name", "wonderland", ["alice"]],
    ["an email address", "BOB@example", ["bob"]],
    ["part of an address", "@example.com", ["bob", "alice", "admin"]],
    ["nothing that exists", "zzz", []],
  ])("finds people by %s", async (_what, q, expected) => {
    const { admin } = await seed();
    const res = await admin.agent.get("/api/admin/users").query({ q });
    expect(res.body.users.map((user: { username: string }) => user.username)).toEqual(expected);
  });

  it("finds a person by their id", async () => {
    const { admin, alice } = await seed();
    const res = await admin.agent.get("/api/admin/users").query({ q: alice.user.id.toUpperCase() });
    expect(res.body.users.map((user: { username: string }) => user.username)).toEqual(["alice"]);
  });

  it("doesn't treat % or _ in a search as wildcards", async () => {
    const { admin } = await seed();
    expect((await admin.agent.get("/api/admin/users").query({ q: "%" })).body.users).toEqual([]);
    expect((await admin.agent.get("/api/admin/users").query({ q: "a_ice" })).body.users).toEqual([]);
  });

  it("filters by whether the email is confirmed", async () => {
    const { admin, bob } = await seed();
    await prisma.user.update({ where: { id: bob.user.id }, data: { emailVerifiedAt: null } });
    await prisma.user.create({ data: { username: "oldtimer", displayName: "Old Timer", passwordHash: "x" } });

    const names = async (filter: string) =>
      (await admin.agent.get("/api/admin/users").query({ filter })).body.users.map((user: { username: string }) => user.username).sort();

    expect(await names("unverified")).toEqual(["bob"]);
    expect(await names("no-email")).toEqual(["oldtimer"]);
    expect(await names("verified")).toEqual(["admin", "alice"]);
    expect(await names("all")).toEqual(["admin", "alice", "bob", "oldtimer"]);
    expect((await admin.agent.get("/api/admin/users").query({ filter: "nonsense" })).status).toBe(400);
  });

  it("pages through everyone", async () => {
    const { admin } = await seed();

    const first = await admin.agent.get("/api/admin/users").query({ limit: 2 });
    expect(first.body.users).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await admin.agent.get("/api/admin/users").query({ limit: 2, cursor: first.body.nextCursor });
    expect(second.body.users.map((user: { username: string }) => user.username)).toEqual(["admin"]);
    expect(second.body.nextCursor).toBeNull();
    expect((await admin.agent.get("/api/admin/users").query({ cursor: "garbage" })).status).toBe(400);
    expect((await admin.agent.get("/api/admin/users").query({ limit: 1000 })).status).toBe(400);
  });

  it("shows everything about one person", async () => {
    const admin = await signUpAdmin();
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    await uploadPhoto(bob.agent, group.id);
    await owner.agent.post(`/api/reports`).send({ userId: bob.user.id, message: "hmm" });
    await bob.agent.post("/api/auth/login").set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15").send({ identifier: "bob@example.com", password: testUser.password });

    const res = await admin.agent.get(`/api/admin/users/${bob.user.id}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      username: "bob",
      email: "bob@example.com",
      emailVerified: true,
      isAdmin: false,
      hasAvatar: false,
    });
    expect(res.body.stats).toMatchObject({ photos: 1, videos: 0, comments: 0, reportsAgainst: 1, reportsMade: 0 });
    expect(res.body.stats.storageBytes).toBeGreaterThan(0);
    expect(res.body.groups).toEqual([
      expect.objectContaining({ id: group.id, name: "The Boys", role: "MEMBER", memberCount: 2 }),
    ]);
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.sessions[0]).toEqual({ id: expect.stringMatching(/^[0-9a-f]{16}$/), device: expect.any(String), createdAt: expect.any(String), lastActiveAt: expect.any(String) });
    expect(res.body.knownDevices.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);
  });

  it("404s for someone who doesn't exist and 400s for something that isn't an id", async () => {
    const { agent } = await signUpAdmin();
    expect((await agent.get("/api/admin/users/0190d5c8-0000-7000-8000-000000000000")).status).toBe(404);
    expect((await agent.get("/api/admin/users/not-an-id")).status).toBe(400);
  });

  describe("actions", () => {
    it("marks an address verified by hand, so the person can get in", async () => {
      const admin = await signUpAdmin();
      const agent = request.agent(app);
      const registered = await agent.post("/api/auth/register").send(testUser);
      expect((await agent.get("/api/groups")).status).toBe(403);

      const res = await admin.agent.post(`/api/admin/users/${registered.body.user.id}/verify-email`);

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ username: "alice", emailVerified: true });
      expect((await agent.get("/api/groups")).status).toBe(200);
      expect(await prisma.emailVerificationToken.count({ where: { userId: registered.body.user.id } })).toBe(0);
    });

    it("can't verify an account that has no address", async () => {
      const admin = await signUpAdmin();
      const user = await prisma.user.create({ data: { username: "oldtimer", displayName: "Old Timer", passwordHash: "x" } });
      const res = await admin.agent.post(`/api/admin/users/${user.id}/verify-email`);
      expect(res.status).toBe(400);
    });

    it("sends the confirmation email again", async () => {
      const admin = await signUpAdmin();
      const registered = await request(app).post("/api/auth/register").send(testUser);
      await settleMail();
      mailbox.length = 0;
      await prisma.emailVerificationToken.updateMany({ data: { createdAt: new Date(Date.now() - 5 * 60_000) } });

      const res = await admin.agent.post(`/api/admin/users/${registered.body.user.id}/resend-verification`);

      expect(res.status).toBe(204);
      expect(mailbox.map((mail) => mail.to)).toEqual(["alice@example.com"]);
    });

    it("signs a person out of every device", async () => {
      const admin = await signUpAdmin();
      const { agent: alice, user } = await signUp(app, "alice");
      await request(app).post("/api/auth/login").send({ identifier: "alice", password: testUser.password });
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(2);

      const res = await admin.agent.post(`/api/admin/users/${user.id}/sign-out`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ signedOut: 2 });
      expect((await alice.get("/api/auth/session")).body).toEqual({ user: null });
      expect((await admin.agent.get("/api/auth/session")).body.user.username).toBe("admin");
    });

    it("deletes an account and what they posted, once the username is typed", async () => {
      const admin = await signUpAdmin();
      const { owner, members, group } = await groupWith(app, "alice", "bob");
      const bob = members[0]!;
      await uploadPhoto(bob.agent, group.id);

      const wrong = await admin.agent.delete(`/api/admin/users/${bob.user.id}`).send({ confirm: "robert" });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error.code).toBe("CONFIRMATION_MISMATCH");
      expect(await prisma.user.count({ where: { id: bob.user.id } })).toBe(1);

      const res = await admin.agent.delete(`/api/admin/users/${bob.user.id}`).send({ confirm: " BOB " });

      expect(res.status).toBe(204);
      expect(await prisma.user.count({ where: { id: bob.user.id } })).toBe(0);
      expect(await prisma.photo.count()).toBe(0);
      expect(await prisma.group.count({ where: { id: group.id } })).toBe(1);
      expect((await owner.agent.get("/api/groups")).status).toBe(200);
      expect((await bob.agent.get("/api/auth/session")).body).toEqual({ user: null });
    });

    it("won't delete the admin, nor anyone through a request with no confirmation", async () => {
      const admin = await signUpAdmin();
      const { user } = await signUp(app, "alice");

      expect((await admin.agent.delete(`/api/admin/users/${admin.user.id}`).send({ confirm: "admin" })).status).toBe(400);
      expect((await admin.agent.delete(`/api/admin/users/${user.id}`)).status).toBe(400);
      expect(await prisma.user.count()).toBe(2);
    });

    it("is for the admin alone", async () => {
      await signUpAdmin();
      const { agent, user } = await signUp(app, "alice");

      for (const send of [
        () => agent.post(`/api/admin/users/${user.id}/verify-email`),
        () => agent.post(`/api/admin/users/${user.id}/sign-out`),
        () => agent.delete(`/api/admin/users/${user.id}`).send({ confirm: "alice" }),
      ]) {
        expect((await send()).status).toBe(404);
      }
      expect(await prisma.user.count()).toBe(2);
    });
  });
});

describe("groups", () => {
  it("lists groups with who owns them and when they last posted", async () => {
    const admin = await signUpAdmin();
    const { owner, group } = await groupWith(app, "alice", "bob");
    await uploadPhoto(owner.agent, group.id);
    await createGroup(owner.agent, { name: "Quiet Ones", emoji: "🤫" });

    const res = await admin.agent.get("/api/admin/groups");

    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(2);
    const boys = res.body.groups.find((entry: { name: string }) => entry.name === "The Boys");
    expect(boys).toMatchObject({
      id: group.id,
      emoji: "🍻",
      memberCount: 2,
      photoCount: 1,
      owner: { username: "alice", displayName: "Alice" },
    });
    expect(boys.lastPostAt).toEqual(expect.any(String));
    expect(res.body.groups.find((entry: { name: string }) => entry.name === "Quiet Ones").lastPostAt).toBeNull();
  });

  it("searches groups by name or id", async () => {
    const admin = await signUpAdmin();
    const { owner, group } = await groupWith(app, "alice");
    await createGroup(owner.agent, { name: "Quiet Ones", emoji: "🤫" });

    const names = async (q: string) =>
      (await admin.agent.get("/api/admin/groups").query({ q })).body.groups.map((entry: { name: string }) => entry.name);

    expect(await names("quiet")).toEqual(["Quiet Ones"]);
    expect(await names(group.id)).toEqual(["The Boys"]);
    expect(await names("nothing")).toEqual([]);
  });

  it("shows the members, what's been shared and what's open", async () => {
    const admin = await signUpAdmin();
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    const photo = await uploadPhoto(owner.agent, group.id);
    await members[0]!.agent.post(`/api/photos/${photo.id}/comments`).send({ body: "🔥" });
    await members[0]!.agent.put(`/api/photos/${photo.id}/reaction`).send({ type: "FIRE" });
    expect((await owner.agent.post(`/api/groups/${group.id}/moments`).send({ title: "Friday at the lake", emoji: "🌊", durationHours: 3 })).status).toBe(201);

    const res = await admin.agent.get(`/api/admin/groups/${group.id}`);

    expect(res.status).toBe(200);
    expect(res.body.group).toMatchObject({ id: group.id, name: "The Boys", emoji: "🍻" });
    expect(res.body.members.map((member: { username: string; role: string }) => [member.username, member.role])).toEqual([
      ["alice", "OWNER"],
      ["bob", "MEMBER"],
    ]);
    expect(res.body.stats).toMatchObject({ photos: 1, videos: 0, comments: 1, reactions: 1, moments: 1, albums: 0, activeInvites: 1 });
    expect(res.body.stats.storageBytes).toBeGreaterThan(0);
    expect(res.body.stats.lastPostAt).toEqual(expect.any(String));
    expect(res.body.openMoment).toMatchObject({ title: "Friday at the lake" });
    expect(JSON.stringify(res.body)).not.toMatch(/@example\.com/);
  });

  it("404s for a group that doesn't exist", async () => {
    const { agent } = await signUpAdmin();
    expect((await agent.get("/api/admin/groups/0190d5c8-0000-7000-8000-000000000000")).status).toBe(404);
  });

  it("takes a member out the way leaving does", async () => {
    const admin = await signUpAdmin();
    const { owner, members, group } = await groupWith(app, "alice", "bob");

    const res = await admin.agent.delete(`/api/admin/groups/${group.id}/members/${members[0]!.user.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ groupDeleted: false });
    expect(await prisma.groupMember.count({ where: { groupId: group.id } })).toBe(1);
    expect((await owner.agent.get(`/api/groups/${group.id}`)).status).toBe(200);
    expect((await members[0]!.agent.get(`/api/groups/${group.id}`)).status).toBe(404);
  });

  it("hands the group on when the owner is removed, and deletes it when the last one goes", async () => {
    const admin = await signUpAdmin();
    const { owner, members, group } = await groupWith(app, "alice", "bob");

    await admin.agent.delete(`/api/admin/groups/${group.id}/members/${owner.user.id}`);
    const bobsRole = await prisma.groupMember.findUniqueOrThrow({ where: { groupId_userId: { groupId: group.id, userId: members[0]!.user.id } } });
    expect(bobsRole.role).toBe("OWNER");

    const last = await admin.agent.delete(`/api/admin/groups/${group.id}/members/${members[0]!.user.id}`);
    expect(last.body).toEqual({ groupDeleted: true });
    expect(await prisma.group.count()).toBe(0);
  });

  it("404s when the person isn't in the group", async () => {
    const admin = await signUpAdmin();
    const { group } = await groupWith(app, "alice");
    const { user: stranger } = await signUp(app, "carol");
    expect((await admin.agent.delete(`/api/admin/groups/${group.id}/members/${stranger.id}`)).status).toBe(404);
  });

  it("deletes a group and everything in it once its name is typed", async () => {
    const admin = await signUpAdmin();
    const { owner, group } = await groupWith(app, "alice", "bob");
    await uploadPhoto(owner.agent, group.id);

    const wrong = await admin.agent.delete(`/api/admin/groups/${group.id}`).send({ confirm: "The Girls" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("CONFIRMATION_MISMATCH");
    expect(await prisma.group.count()).toBe(1);

    const res = await admin.agent.delete(`/api/admin/groups/${group.id}`).send({ confirm: "The Boys" });

    expect(res.status).toBe(204);
    expect(await prisma.group.count()).toBe(0);
    expect(await prisma.photo.count()).toBe(0);
    expect(await prisma.user.count({ where: { username: "alice" } })).toBe(1);
  });
});

describe("reports", () => {
  it("lists what people have reported, newest first", async () => {
    const admin = await signUpAdmin();
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const photo = await uploadPhoto(bob.agent, group.id, undefined, "a caption");
    await owner.agent.post("/api/reports").send({ photoId: photo.id, userId: bob.user.id, message: "first" });
    await owner.agent.post("/api/reports").send({ message: "general feedback" });

    const res = await admin.agent.get("/api/admin/reports");

    expect(res.status).toBe(200);
    expect(res.body.reports.map((report: { message: string }) => report.message)).toEqual(["general feedback", "first"]);
    expect(res.body.reports[0]).toMatchObject({ reporter: { username: "alice" }, reportedUser: null, photo: null });
    expect(res.body.reports[1]).toMatchObject({
      reporter: { username: "alice" },
      reportedUser: { username: "bob" },
      photo: { id: photo.id, caption: "a caption", kind: "photo", group: { name: "The Boys" }, uploader: { username: "bob" } },
    });
    expect(res.body.nextCursor).toBeNull();
  });
});

describe("GET /api/admin/system", () => {
  const checkOf = (body: { checks: { id: string; status: string; detail: string }[] }, id: string) =>
    body.checks.find((check) => check.id === id)!;

  it("checks the database, storage, mail, features and data", async () => {
    const { agent } = await signUpAdmin();
    const res = await agent.get("/api/admin/system");

    expect(res.status).toBe(200);
    expect(res.body.checks.map((check: { id: string }) => check.id)).toEqual([
      "database",
      "storage",
      "mail",
      "push",
      "apns",
      "video",
      "app-url",
      "admins",
      "group-owners",
      "empty-groups",
      "unverified",
      "no-email",
      "queue",
      "expired",
    ]);
    expect(checkOf(res.body, "database")).toMatchObject({ status: "ok", group: "Services" });
    expect(checkOf(res.body, "database").detail).toMatch(/MySQL .*migrations? applied/);
    expect(checkOf(res.body, "storage").status).toBe("ok");
    expect(checkOf(res.body, "mail").status).toBe("ok");
    expect(checkOf(res.body, "admins")).toMatchObject({ status: "ok", detail: "1 address in ADMIN_EMAILS." });
    expect(checkOf(res.body, "group-owners").status).toBe("ok");
    expect(res.body.status).toBe("ok");
    expect(res.body.server).toMatchObject({
      environment: "test",
      nodeVersion: process.version,
      uptimeSeconds: expect.any(Number),
      memoryMb: { rss: expect.any(Number), heapUsed: expect.any(Number) },
    });
  });

  it("warns that people can't confirm their email while no mail server is set up", async () => {
    setMailTransport(null);
    const { agent } = await signUpAdmin();

    const res = await agent.get("/api/admin/system");

    expect(checkOf(res.body, "mail").status).toBe("warning");
    expect(checkOf(res.body, "mail").detail).toMatch(/SMTP_HOST/);
    expect(res.body.status).toBe("warning");
  });

  it("reports a mail server that refuses the connection", async () => {
    setMailTransport({
      send: async () => {},
      verify: async () => {
        throw new Error("Invalid login: 535 5.7.8 Authentication failed");
      },
    });
    const { agent } = await signUpAdmin();

    const res = await agent.get("/api/admin/system");

    expect(checkOf(res.body, "mail")).toMatchObject({ status: "error" });
    expect(checkOf(res.body, "mail").detail).toContain("Authentication failed");
    expect(res.body.status).toBe("error");
  });

  it("finds data that has gone wrong", async () => {
    const { agent } = await signUpAdmin();
    const { owner, group } = await groupWith(app, "alice");
    await prisma.group.create({ data: { name: "Nobody Home", emoji: "🏚️" } });
    await prisma.groupMember.update({ where: { groupId_userId: { groupId: group.id, userId: owner.user.id } }, data: { role: "MEMBER" } });
    await prisma.user.create({ data: { username: "oldtimer", displayName: "Old Timer", passwordHash: "x" } });
    const stale = await prisma.user.create({ data: { username: "stale", displayName: "Stale", email: "stale@example.com", passwordHash: "x" } });
    await prisma.user.update({ where: { id: stale.id }, data: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } });
    await prisma.queuedNotification.create({
      data: { userId: owner.user.id, tag: "t", title: "x", body: "x", url: "/", deliverAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
    });

    const res = await agent.get("/api/admin/system");

    expect(checkOf(res.body, "group-owners")).toMatchObject({ status: "error", detail: "2 groups without an owner and 0 groups with several." });
    expect(checkOf(res.body, "empty-groups")).toMatchObject({ status: "warning" });
    expect(checkOf(res.body, "unverified")).toMatchObject({ status: "warning" });
    expect(checkOf(res.body, "no-email").status).toBe("warning");
    expect(checkOf(res.body, "queue").status).toBe("warning");
    expect(res.body.status).toBe("error");
  });

  it("includes recent problems the server logged", async () => {
    const { agent } = await signUpAdmin();
    logger.warn("Something odd happened", new Error("details here"));

    const res = await agent.get("/api/admin/system");

    expect(res.body.problems[0]).toMatchObject({
      level: "warn",
      message: "Something odd happened",
      detail: "Error: details here",
      at: expect.any(String),
    });
  });

  describe("POST /api/admin/system/test-email", () => {
    it("sends a real email to the admin's own address", async () => {
      const { agent } = await signUpAdmin();

      const res = await agent.post("/api/admin/system/test-email");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ to: "admin@example.com", delivered: true });
      expect(mailbox).toHaveLength(1);
      expect(mailbox[0]).toMatchObject({ to: "admin@example.com", subject: "Test email from Friendship Wrapped" });
    });

    it("says when the mail server refused it", async () => {
      setMailTransport({
        send: async () => {
          throw new Error("550 mailbox unavailable");
        },
        verify: async () => {},
      });
      const { agent } = await signUpAdmin();

      const res = await agent.post("/api/admin/system/test-email");

      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe("EMAIL_SEND_FAILED");
      expect(res.body.error.message).toContain("550 mailbox unavailable");
    });

    it("says when nothing was really sent", async () => {
      setMailTransport(null);
      const { agent } = await signUpAdmin();

      const res = await agent.post("/api/admin/system/test-email");

      expect(res.status).toBe(200);
      expect(res.body.delivered).toBe(false);
    });

    it("can't be held down", async () => {
      const { agent } = await signUpAdmin();
      for (let i = 0; i < 5; i++) expect((await agent.post("/api/admin/system/test-email")).status).toBe(200);
      expect((await agent.post("/api/admin/system/test-email")).status).toBe(429);
    });
  });
});

describe("same-origin protection", () => {
  it("applies to the admin panel's changes too", async () => {
    const { agent, user } = await signUpAdmin();
    const { user: alice } = await signUp(app, "alice");
    const res = await (agent as Agent).delete(`/api/admin/users/${alice.id}`).set("Origin", "https://evil.example").send({ confirm: "alice" });

    expect(res.status).toBe(403);
    expect(await prisma.user.count({ where: { id: alice.id } })).toBe(1);
    expect(user.username).toBe("admin");
  });
});

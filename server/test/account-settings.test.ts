import request, { type Response } from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  createGroup,
  createInvite,
  groupWith,
  photoAt,
  resetDatabase,
  resetStorage,
  signUp,
  testUser,
} from "./helpers.js";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
  await resetStorage();
});

afterAll(async () => {
  await resetDatabase();
  await resetStorage();
  await prisma.$disconnect();
});

const CHROME_ON_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SAFARI_ON_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const IOS_APP = "FriendshipWrapped/1 CFNetwork/3826.500.131 Darwin/24.5.0";

/** Signs in as an existing user from another "device". */
async function signInAgain(username: string, userAgent?: string) {
  const agent = request.agent(app);
  const req = agent.post("/api/auth/login");
  if (userAgent) req.set("User-Agent", userAgent);
  expect((await req.send({ username, password: testUser.password })).status).toBe(200);
  return agent;
}

const DEFAULTS = {
  allowPhotoSaving: true,
  showInWrapped: true,
  timeZone: null,
  notifications: {
    enabled: true,
    photos: true,
    reactions: true,
    comments: true,
    members: false,
    onThisDay: true,
    wrapped: true,
    quietHours: { enabled: true, start: "23:00", end: "08:00" },
  },
};

describe("settings", () => {
  it("start with the defaults, without storing anything", async () => {
    const { agent } = await signUp(app, "alice");
    const res = await agent.get("/api/users/me/settings");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ settings: DEFAULTS });
    expect(await prisma.userSettings.count()).toBe(0);
  });

  it("change only what's sent, nested values included", async () => {
    const { agent } = await signUp(app, "alice");

    let res = await agent.patch("/api/users/me/settings").send({ notifications: { quietHours: { start: "22:30" } } });
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({
      ...DEFAULTS,
      notifications: { ...DEFAULTS.notifications, quietHours: { enabled: true, start: "22:30", end: "08:00" } },
    });

    res = await agent
      .patch("/api/users/me/settings")
      .send({ showInWrapped: false, timeZone: "europe/bratislava", notifications: { members: true } });
    expect(res.body.settings).toMatchObject({
      showInWrapped: false,
      allowPhotoSaving: true,
      timeZone: "Europe/Bratislava",
      notifications: { members: true, photos: true, quietHours: { start: "22:30" } },
    });
    expect((await agent.get("/api/users/me/settings")).body).toEqual(res.body);

    expect((await agent.patch("/api/users/me/settings").send({ timeZone: null })).body.settings.timeZone).toBeNull();
  });

  it("reject invalid values", async () => {
    const { agent } = await signUp(app, "alice");
    for (const body of [
      { timeZone: "Mars/Olympus" },
      { notifications: { quietHours: { end: "24:00" } } },
      { notifications: { quietHours: { start: "7:00" } } },
      { allowPhotoSaving: "yes" },
    ]) {
      expect((await agent.patch("/api/users/me/settings").send(body)).status).toBe(400);
    }
    expect((await request(app).get("/api/users/me/settings")).status).toBe(401);
  });

  it("go with the account", async () => {
    const { agent } = await signUp(app, "alice");
    await agent.patch("/api/users/me/settings").send({ showInWrapped: false });
    expect((await agent.delete("/api/users/me").send({ password: testUser.password })).status).toBe(204);
    expect(await prisma.userSettings.count()).toBe(0);
  });
});

describe("changing your username", () => {
  it("follows the registration rules and must be free", async () => {
    const alice = await signUp(app, "alice");
    await signUp(app, "bob");

    const res = await alice.agent.patch("/api/users/me").send({ username: "  Alicia.W " });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: "alicia.w", displayName: "Alice" });

    const taken = await alice.agent.patch("/api/users/me").send({ username: "bob" });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toMatchObject({
      code: "USERNAME_TAKEN",
      details: [{ path: "username", message: "That username is already taken" }],
    });
    expect((await alice.agent.patch("/api/users/me").send({ username: "a" })).status).toBe(400);
    expect((await alice.agent.patch("/api/users/me").send({})).status).toBe(400);

    // The new name signs in.
    await signInAgain("alicia.w");
  });
});

describe("changing your password", () => {
  it("needs the current one, and signs out everywhere else", async () => {
    const alice = await signUp(app, "alice");
    const phone = await signInAgain("alice");
    const change = (body: object) => alice.agent.put("/api/users/me/password").send(body);

    const wrong = await change({ currentPassword: "nope", newPassword: "a brand new password" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatchObject({
      code: "INCORRECT_PASSWORD",
      details: [{ path: "currentPassword", message: expect.any(String) }],
    });
    expect((await change({ currentPassword: testUser.password, newPassword: "short" })).status).toBe(400);

    expect((await change({ currentPassword: testUser.password, newPassword: "a brand new password" })).status).toBe(204);
    expect((await phone.get("/api/groups")).status).toBe(401);
    expect((await alice.agent.get("/api/groups")).status).toBe(200);

    const oldLogin = await request(app).post("/api/auth/login").send({ username: "alice", password: testUser.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post("/api/auth/login").send({ username: "alice", password: "a brand new password" });
    expect(newLogin.status).toBe(200);
  });

  it("is rate limited", async () => {
    const alice = await signUp(app, "alice");
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await alice.agent.put("/api/users/me/password").send({ currentPassword: "guess", newPassword: "whatever123" });
      expect(res.status).toBe(400);
    }
    const limited = await alice.agent
      .put("/api/users/me/password")
      .send({ currentPassword: testUser.password, newPassword: "whatever123" });
    expect(limited.status).toBe(429);
  });
});

describe("signed-in devices", () => {
  type SessionBody = { id: string; device: string; createdAt: string; lastActiveAt: string; current: boolean };

  it("are listed with this one first, and can be signed out", async () => {
    await signUp(app, "alice");
    const laptop = await signInAgain("alice", CHROME_ON_WINDOWS);
    const phone = await signInAgain("alice", SAFARI_ON_IPHONE);
    const app_ = await signInAgain("alice", IOS_APP);

    const res = await laptop.get("/api/users/me/sessions");
    expect(res.status).toBe(200);
    const sessions = res.body.sessions as SessionBody[];
    expect(sessions).toHaveLength(4);
    expect(sessions[0]).toMatchObject({ device: "Chrome on Windows", current: true });
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    expect(sessions.map((s) => s.device).toSorted()).toEqual(
      ["Chrome on Windows", "Friendship Wrapped app on iPhone", "Safari on iPhone", "Unknown device"].toSorted(),
    );
    for (const session of sessions) {
      expect(session.id).toMatch(/^[0-9a-f]{16}$/);
      expect(Object.keys(session).toSorted()).toEqual(["createdAt", "current", "device", "id", "lastActiveAt"]);
    }

    const phoneSession = sessions.find((s) => s.device === "Safari on iPhone")!;
    expect((await laptop.delete(`/api/users/me/sessions/${phoneSession.id}`)).status).toBe(204);
    expect((await phone.get("/api/groups")).status).toBe(401);
    expect((await laptop.delete(`/api/users/me/sessions/${phoneSession.id}`)).status).toBe(404);
    expect((await laptop.delete("/api/users/me/sessions/not-an-id")).status).toBe(400);

    // Someone else's session ids mean nothing to you.
    const bob = await signUp(app, "bob");
    const appSession = sessions.find((s) => s.device === "Friendship Wrapped app on iPhone")!;
    expect((await bob.agent.delete(`/api/users/me/sessions/${appSession.id}`)).status).toBe(404);

    expect((await laptop.delete("/api/users/me/sessions")).status).toBe(204);
    expect((await app_.get("/api/groups")).status).toBe(401);
    const left = (await laptop.get("/api/users/me/sessions")).body.sessions as SessionBody[];
    expect(left).toEqual([expect.objectContaining({ current: true, device: "Chrome on Windows" })]);
  });

  it("record when they were last used, at most every few minutes", async () => {
    const { agent, user } = await signUp(app, "alice");
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.session.updateMany({ where: { userId: user.id }, data: { lastActiveAt: longAgo } });

    await agent.get("/api/groups");
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.lastActiveAt.getTime()).toBeGreaterThan(Date.now() - 60 * 1000);
  });
});

/** Collects a binary response body. */
function binary(res: Response, callback: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

/** The file names in a zip, from its central directory. */
function zipEntries(zip: Buffer): string[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

describe("your photo archive", () => {
  it("is a zip of every photo you posted, by group and time", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const odd = await createGroup(alice.agent, { name: 'Trip: "A/B"?', emoji: "🧳" });
    await photoAt(alice.agent, group.id, "2025-08-01T12:00:00Z");
    await photoAt(alice.agent, group.id, "2025-08-01T12:00:00.500Z"); // the same second
    await photoAt(alice.agent, odd.id, "2026-01-02T03:04:05Z");
    await photoAt(members[0]!.agent, group.id, "2025-09-01T12:00:00Z"); // Bob's: not in Alice's archive

    const res = await alice.agent.get("/api/users/me/photos/archive").buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="friendship-wrapped-photos.zip"');
    const zip = res.body as Buffer;
    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(zipEntries(zip).toSorted()).toEqual(
      [
        "The Boys/2025-08-01 12.00.00.webp",
        "The Boys/2025-08-01 12.00.00 (2).webp",
        "Trip_ _A_B__/2026-01-02 03.04.05.webp",
      ].toSorted(),
    );
  });

  it("uses your time zone, and is rate limited", async () => {
    const { owner: alice, group } = await groupWith(app, "alice");
    await alice.agent.patch("/api/users/me/settings").send({ timeZone: "Europe/Bratislava" });
    await photoAt(alice.agent, group.id, "2025-08-01T22:30:00Z");

    const res = await alice.agent.get("/api/users/me/photos/archive").buffer(true).parse(binary);
    expect(zipEntries(res.body as Buffer)).toEqual(["The Boys/2025-08-02 00.30.00.webp"]);

    expect((await alice.agent.get("/api/users/me/photos/archive")).status).toBe(200);
    expect((await alice.agent.get("/api/users/me/photos/archive")).status).toBe(200);
    expect((await alice.agent.get("/api/users/me/photos/archive")).status).toBe(429);
  });
});

describe("your invite links", () => {
  it("are listed while they work, and can be revoked", async () => {
    const { owner: alice, members, group, token } = await groupWith(app, "alice", "bob");
    const second = await createInvite(alice.agent, group.id);
    const bobs = await createInvite(members[0]!.agent, group.id);

    const res = await alice.agent.get("/api/users/me/invites");
    expect(res.status).toBe(200);
    const invites = res.body.invites as { id: string; group: object; createdAt: string; expiresAt: string }[];
    expect(invites).toHaveLength(2);
    expect(invites[0]).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{16}$/),
      group: { id: group.id, name: "The Boys", emoji: "🍻", avatarUrl: null },
      createdAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    for (const invite of invites) expect(JSON.stringify(invite)).not.toContain(token);

    // Bob can't revoke Alice's.
    expect((await members[0]!.agent.delete(`/api/users/me/invites/${invites[0]!.id}`)).status).toBe(404);

    for (const invite of invites) expect((await alice.agent.delete(`/api/users/me/invites/${invite.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/invites/${token}`)).status).toBe(404);
    expect((await request(app).get(`/api/invites/${second}`)).status).toBe(404);
    expect((await request(app).get(`/api/invites/${bobs}`)).status).toBe(200);
    expect((await alice.agent.get("/api/users/me/invites")).body.invites).toEqual([]);
    expect((await alice.agent.delete(`/api/users/me/invites/${invites[0]!.id}`)).status).toBe(404);

    // Expired ones aren't listed.
    await createInvite(alice.agent, group.id);
    await prisma.inviteToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await alice.agent.get("/api/users/me/invites")).body.invites).toEqual([]);
  });
});


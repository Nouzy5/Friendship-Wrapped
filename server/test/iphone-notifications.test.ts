import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ApnsError, setApnsSender, type ApnsTarget } from "../src/lib/apns.js";
import { prisma } from "../src/lib/prisma.js";
import { setPushSender, type PushPayload, type PushTarget } from "../src/lib/push.js";
import { runScheduledNotifications } from "../src/modules/notifications/notification-scheduler.js";
import { settleNotifications } from "../src/modules/notifications/notifications.service.js";
import {
  createInvite,
  groupWith,
  photoAt,
  resetDatabase,
  resetStorage,
  signUp,
  uploadPhoto,
  type Agent,
} from "./helpers.js";

const app = createApp();

/** What the fake Apple server received: which phone (by token) got which notification. */
let sentToPhones: { target: ApnsTarget; payload: PushPayload }[] = [];
/** Phones the fake Apple server refuses, by token: the status and reason it answers with. */
const refusing = new Map<string, { status: number; reason: string }>();

async function fakeApns(target: ApnsTarget, payload: PushPayload) {
  const refusal = refusing.get(target.token);
  if (refusal) throw new ApnsError(refusal.status, refusal.reason);
  sentToPhones.push({ target, payload });
}

/** What the fake web push service received (browsers), by endpoint. */
let sentToBrowsers: { endpoint: string; payload: PushPayload }[] = [];
async function fakeWebPush(target: PushTarget, payload: PushPayload) {
  sentToBrowsers.push({ endpoint: target.endpoint, payload });
}

beforeEach(async () => {
  await resetDatabase();
  await resetStorage();
  sentToPhones = [];
  sentToBrowsers = [];
  refusing.clear();
  setApnsSender(fakeApns);
  setPushSender(null);
});

afterEach(async () => {
  await settleNotifications();
  setApnsSender(null);
  setPushSender(null);
});

afterAll(async () => {
  await resetDatabase();
  await resetStorage();
  await prisma.$disconnect();
});

/** A phone's token: 32 bytes of hex, readable back as the name. */
const tokenOf = (username: string) => Buffer.from(username.padEnd(32, "_")).toString("hex");
const nameOf = (token: string) => Buffer.from(token, "hex").toString().replace(/_+$/, "");

function registerPhone(agent: Agent, username: string, environment: "sandbox" | "production" = "sandbox") {
  return agent.post("/api/notifications/devices").send({ token: tokenOf(username), environment });
}

function subscribeBrowser(agent: Agent, username: string) {
  return agent.post("/api/notifications/subscriptions").send({
    endpoint: `https://push.example.com/send/${username}`,
    keys: { p256dh: `BKey-${username}`, auth: `auth-${username}` },
  });
}

/** Everything sent to phones since the last call, as "username: body". */
async function toPhones(): Promise<string[]> {
  await settleNotifications();
  const lines = sentToPhones.map(({ target, payload }) => `${nameOf(target.token)}: ${payload.body}`);
  sentToPhones = [];
  return lines.toSorted();
}

/** Everything sent to browsers since the last call, as "username: body". */
async function toBrowsers(): Promise<string[]> {
  await settleNotifications();
  const lines = sentToBrowsers.map(({ endpoint, payload }) => `${endpoint.split("/").at(-1)}: ${payload.body}`);
  sentToBrowsers = [];
  return lines.toSorted();
}

/** "HH:MM" in UTC, `minutes` from now. */
function utcClock(minutes: number) {
  const at = new Date(Date.now() + minutes * 60 * 1000);
  return `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`;
}

/** A group of everyone named, each with their phone registered (and only the phone). */
async function groupOfPhones(...usernames: string[]) {
  const setup = await groupWith(app, ...usernames);
  const everyone = [setup.owner, ...setup.members];
  for (const [index, person] of everyone.entries()) {
    expect((await registerPhone(person.agent, usernames[index]!)).status).toBe(201);
  }
  await toPhones();
  return { ...setup, everyone };
}

describe("iPhone registration", () => {
  it("registers a phone by its token, once, whoever is signed in on it", async () => {
    const alice = await signUp(app, "alice");
    const bob = await signUp(app, "bob");

    expect((await registerPhone(alice.agent, "phone", "sandbox")).status).toBe(201);
    expect((await registerPhone(alice.agent, "phone", "production")).status).toBe(201); // again: updated, not doubled
    expect(await prisma.apnsDevice.findMany()).toMatchObject([
      { userId: alice.user.id, token: tokenOf("phone"), environment: "PRODUCTION" },
    ]);

    // Another person signs in on the same phone: it moves to them.
    expect((await registerPhone(bob.agent, "phone")).status).toBe(201);
    expect(await prisma.apnsDevice.findMany()).toMatchObject([
      { userId: bob.user.id, token: tokenOf("phone"), environment: "SANDBOX" },
    ]);

    // Removing only touches your own.
    const remove = (agent: Agent) => agent.delete("/api/notifications/devices").send({ token: tokenOf("phone") });
    expect((await remove(alice.agent)).status).toBe(204);
    expect(await prisma.apnsDevice.count()).toBe(1);
    expect((await remove(bob.agent)).status).toBe(204);
    expect(await prisma.apnsDevice.count()).toBe(0);
    expect((await remove(bob.agent)).status).toBe(204); // nothing left: still fine
  });

  it("accepts the token in any letter case and keeps it lowercase", async () => {
    const alice = await signUp(app, "alice");
    const register = (token: string) => alice.agent.post("/api/notifications/devices").send({ token, environment: "sandbox" });
    expect((await register("AB".repeat(32))).status).toBe(201);
    expect((await register("ab".repeat(32))).status).toBe(201);

    expect(await prisma.apnsDevice.findMany()).toMatchObject([{ token: "ab".repeat(32) }]);
  });

  it("refuses anything that isn't an Apple device token, and signed-out requests", async () => {
    const alice = await signUp(app, "alice");
    const bad = [
      { token: "short", environment: "sandbox" },
      { token: "zz".repeat(32), environment: "sandbox" },
      { token: "ab".repeat(101), environment: "sandbox" },
      { token: "ab".repeat(32), environment: "staging" },
      { token: "ab".repeat(32) },
      { environment: "sandbox" },
      {},
    ];
    for (const body of bad) {
      const res = await alice.agent.post("/api/notifications/devices").send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect((await alice.agent.delete("/api/notifications/devices").send({ token: "nope" })).status).toBe(400);
    expect(await prisma.apnsDevice.count()).toBe(0);

    const body = { token: tokenOf("x"), environment: "sandbox" };
    expect((await request(app).post("/api/notifications/devices").send(body)).status).toBe(401);
    expect((await request(app).delete("/api/notifications/devices").send({ token: body.token })).status).toBe(401);
  });

  it("tells the app whether this server can reach iPhones", async () => {
    expect((await request(app).get("/api/notifications/push-key")).body).toEqual({ publicKey: null, apns: true });
    setApnsSender(null);
    expect((await request(app).get("/api/notifications/push-key")).body).toEqual({ publicKey: null, apns: false });
  });

  it("belongs to the session that registered it, so signing out removes it", async () => {
    const alice = await signUp(app, "alice");
    await registerPhone(alice.agent, "phone");
    const session = await prisma.session.findFirstOrThrow();
    expect(await prisma.apnsDevice.findFirstOrThrow()).toMatchObject({ sessionId: session.id });

    expect((await alice.agent.post("/api/auth/logout")).status).toBe(204);
    expect(await prisma.apnsDevice.count()).toBe(0);
  });

  it("goes with the account when it is deleted", async () => {
    const alice = await signUp(app, "alice");
    await registerPhone(alice.agent, "phone");

    const res = await alice.agent.delete("/api/users/me").send({ password: "correct horse battery staple" });
    expect(res.status).toBe(204);
    expect(await prisma.apnsDevice.count()).toBe(0);
  });

  it("is removed when its device is signed out from another, or the password is changed", async () => {
    const password = "correct horse battery staple";
    const alice = await signUp(app, "alice");
    const laptop = request.agent(app);
    expect((await laptop.post("/api/auth/login").send({ username: "alice", password })).status).toBe(200);
    await registerPhone(alice.agent, "phone");
    await registerPhone(laptop, "tablet");
    expect(await prisma.apnsDevice.count()).toBe(2);

    // The phone's session is signed out from the laptop (the "signed-in devices" list).
    const sessions = (await laptop.get("/api/users/me/sessions")).body.sessions as { id: string; current: boolean }[];
    const phoneSession = sessions.find((session) => !session.current)!;
    expect((await laptop.delete(`/api/users/me/sessions/${phoneSession.id}`)).status).toBe(204);
    expect((await prisma.apnsDevice.findMany()).map((d) => nameOf(d.token))).toEqual(["tablet"]);

    // Changing the password signs out every other device.
    const other = request.agent(app);
    await other.post("/api/auth/login").send({ username: "alice", password });
    await registerPhone(other, "watch");
    expect((await prisma.apnsDevice.count())).toBe(2);
    const changed = await laptop.put("/api/users/me/password").send({ currentPassword: password, newPassword: "a different long passphrase" });
    expect(changed.status).toBe(204);
    expect((await prisma.apnsDevice.findMany()).map((d) => nameOf(d.token))).toEqual(["tablet"]);
  });
});

describe("iPhone notifications", () => {
  it("tell the rest of the group, like the browser ones, and never the person who did it", async () => {
    const { members, group } = await groupOfPhones("alice", "bob", "carol");
    const photo = await uploadPhoto(members[0]!.agent, group.id);

    await settleNotifications();
    expect(sentToPhones).toHaveLength(2);
    expect(sentToPhones[0]).toMatchObject({
      target: { environment: "SANDBOX" },
      payload: { title: "🍻 The Boys", body: "Bob posted a photo", url: `/photos/${photo.id}`, tag: `photos:${group.id}` },
    });
    expect(await toPhones()).toEqual(["alice: Bob posted a photo", "carol: Bob posted a photo"]);
  });

  it("go to a person's browsers and phones both, and to either alone", async () => {
    setPushSender(fakeWebPush);
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob", "carol", "dave");
    const [bob, carol, dave] = members as [(typeof members)[0], (typeof members)[0], (typeof members)[0]];
    await registerPhone(alice.agent, "alice"); // a phone only
    await subscribeBrowser(bob.agent, "bob"); // a browser only
    await registerPhone(carol.agent, "carol", "production"); // both
    await subscribeBrowser(carol.agent, "carol");
    await toBrowsers();
    await toPhones();

    await uploadPhoto(dave.agent, group.id);
    expect(await toBrowsers()).toEqual(["bob: Dave posted a photo", "carol: Dave posted a photo"]);
    await settleNotifications();
    expect(sentToPhones.map(({ target }) => [nameOf(target.token), target.environment]).toSorted()).toEqual([
      ["alice", "SANDBOX"],
      ["carol", "PRODUCTION"],
    ]);
  });

  it("work while web push is off, and stay quiet while Apple push is off", async () => {
    const { members, group } = await groupOfPhones("alice", "bob");

    await uploadPhoto(members[0]!.agent, group.id);
    expect(await toPhones()).toEqual(["alice: Bob posted a photo"]);

    setApnsSender(null);
    await uploadPhoto(members[0]!.agent, group.id);
    await settleNotifications();
    expect(sentToPhones).toEqual([]);
    expect(await prisma.apnsDevice.count()).toBe(2); // nothing was lost
  });

  it("follow the same settings as the browser ones: muted groups, blocks, kinds, the master switch", async () => {
    const { members, group } = await groupOfPhones("alice", "bob", "carol", "dave", "erin");
    const [bob, carol, dave, erin] = members as [(typeof members)[0], (typeof members)[0], (typeof members)[0], (typeof members)[0]];

    await carol.agent.patch(`/api/groups/${group.id}/members/me`).send({ muted: true });
    await dave.agent.put(`/api/users/me/blocks/${bob.user.id}`);
    await erin.agent.patch("/api/users/me/settings").send({ notifications: { photos: false } });
    await uploadPhoto(bob.agent, group.id);
    expect(await toPhones()).toEqual(["alice: Bob posted a photo"]);

    await erin.agent.patch("/api/users/me/settings").send({ notifications: { photos: true, enabled: false } });
    await uploadPhoto(bob.agent, group.id);
    expect(await toPhones()).toEqual(["alice: Bob posted a photo"]);
  });

  it("stop reaching a phone once its session has run out, even before the row is swept up", async () => {
    const { owner: alice, members, group } = await groupOfPhones("alice", "bob");
    await prisma.session.updateMany({ where: { userId: alice.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await uploadPhoto(members[0]!.agent, group.id);
    expect(await toPhones()).toEqual([]);
    expect(await prisma.apnsDevice.count()).toBe(2);
  });

  it("stop reaching a phone that was signed out", async () => {
    const { owner: alice, members, group } = await groupOfPhones("alice", "bob");
    await alice.agent.post("/api/auth/logout");

    await uploadPhoto(members[0]!.agent, group.id);
    expect(await toPhones()).toEqual([]);
  });

  it("go to whoever is signed in on a phone now", async () => {
    const { owner: alice, members, group } = await groupOfPhones("alice", "bob");
    const carol = await signUp(app, "carol");
    await carol.agent.post(`/api/invites/${await createInvite(alice.agent, group.id)}/accept`);
    await registerPhone(carol.agent, "alice"); // carol signs in on alice's phone

    await uploadPhoto(members[0]!.agent, group.id);
    await settleNotifications();
    expect(sentToPhones).toHaveLength(1);
    expect(sentToPhones[0]!.target.token).toBe(tokenOf("alice"));
    expect(await prisma.apnsDevice.findMany({ where: { token: tokenOf("alice") } })).toMatchObject([{ userId: carol.user.id }]);
  });

  it("drop a phone Apple says is gone, and keep one that just failed this time", async () => {
    const { members, group } = await groupOfPhones("alice", "bob", "carol", "dave", "erin");
    refusing.set(tokenOf("alice"), { status: 410, reason: "Unregistered" });
    refusing.set(tokenOf("carol"), { status: 400, reason: "BadDeviceToken" });
    refusing.set(tokenOf("dave"), { status: 400, reason: "DeviceTokenNotForTopic" });
    refusing.set(tokenOf("erin"), { status: 503, reason: "ServiceUnavailable" });

    await uploadPhoto(members[0]!.agent, group.id);
    expect(await toPhones()).toEqual([]);
    const left = await prisma.apnsDevice.findMany();
    expect(left.map((device) => nameOf(device.token)).toSorted()).toEqual(["bob", "erin"]);
  });

  it("hold back during quiet hours, then reach the phone when they end", async () => {
    const { owner: alice, members, group } = await groupOfPhones("alice", "bob");
    await alice.agent.patch("/api/users/me/settings").send({
      timeZone: "UTC",
      notifications: { quietHours: { enabled: true, start: utcClock(-60), end: utcClock(60) } },
    });

    await uploadPhoto(members[0]!.agent, group.id);
    expect(await toPhones()).toEqual([]);
    const [queued] = await prisma.queuedNotification.findMany();

    await runScheduledNotifications(queued!.deliverAt);
    expect(await toPhones()).toEqual(["alice: Bob posted a photo"]);
  });

  it("include On This Day for someone with only an iPhone", async () => {
    const { owner: alice, group } = await groupOfPhones("alice", "bob");
    await alice.agent.patch("/api/users/me/settings").send({ timeZone: "UTC" });
    await photoAt(alice.agent, group.id, "2025-10-07T12:00:00Z");
    await toPhones(); // bob heard about the photo itself

    await runScheduledNotifications(new Date("2026-10-07T09:05:00Z"));
    expect(await toPhones()).toEqual(["alice: 1 photo from this day in 2025"]);
    await runScheduledNotifications(new Date("2026-10-07T12:00:00Z"));
    expect(await toPhones()).toEqual([]);
  });
});

import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { setPushSender, type PushPayload, type PushTarget } from "../src/lib/push.js";
import { runScheduledNotifications } from "../src/modules/notifications/notification-scheduler.js";
import { settleNotifications } from "../src/modules/notifications/notifications.service.js";
import { quietHoursEnd } from "../src/modules/notifications/quiet-hours.js";
import { toUserSettings } from "../src/modules/settings/settings.dto.js";
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

/** What the fake push service received: who (by endpoint) got which notification. */
let sent: { endpoint: string; payload: PushPayload }[] = [];
/** Endpoints the fake push service answers with this status instead of accepting. */
const failing = new Map<string, number>();

async function fakeSender(target: PushTarget, payload: PushPayload) {
  const status = failing.get(target.endpoint);
  if (status) throw Object.assign(new Error(`Push failed: ${status}`), { statusCode: status });
  sent.push({ endpoint: target.endpoint, payload });
}

beforeEach(async () => {
  await resetDatabase();
  await resetStorage();
  sent = [];
  failing.clear();
  setPushSender(fakeSender);
});

afterEach(async () => {
  await settleNotifications();
  setPushSender(null);
});

afterAll(async () => {
  await resetDatabase();
  await resetStorage();
  await prisma.$disconnect();
});

const endpointOf = (username: string) => `https://push.example.com/send/${username}`;

function subscribe(agent: Agent, username: string) {
  return agent.post("/api/notifications/subscriptions").send({
    endpoint: endpointOf(username),
    keys: { p256dh: `BKey-${username}`, auth: `auth-${username}` },
  });
}

/** Everything sent since the last call, as "username: body". */
async function delivered(): Promise<string[]> {
  await settleNotifications();
  const lines = sent.map(({ endpoint, payload }) => `${endpoint.split("/").at(-1)}: ${payload.body}`);
  sent = [];
  return lines.toSorted();
}

/** A group of everyone named, all subscribed to push, with the setup's own notifications cleared. */
async function subscribedGroup(...usernames: string[]) {
  const setup = await groupWith(app, ...usernames);
  const everyone = [setup.owner, ...setup.members];
  for (const [index, person] of everyone.entries()) {
    expect((await subscribe(person.agent, usernames[index]!)).status).toBe(201);
  }
  await delivered();
  return { ...setup, everyone };
}

describe("push subscriptions", () => {
  it("hands out the public key (none in tests), and subscribes browsers by endpoint", async () => {
    expect((await request(app).get("/api/notifications/push-key")).body).toEqual({ publicKey: null });

    const alice = await signUp(app, "alice");
    const bob = await signUp(app, "bob");
    expect((await subscribe(alice.agent, "shared")).status).toBe(201);
    expect((await subscribe(alice.agent, "shared")).status).toBe(201); // again: updated, not doubled
    expect(await prisma.pushSubscription.count()).toBe(1);

    // The same browser signed in as someone else moves to them.
    expect((await subscribe(bob.agent, "shared")).status).toBe(201);
    expect(await prisma.pushSubscription.findFirstOrThrow()).toMatchObject({ userId: bob.user.id, p256dh: "BKey-shared" });

    // Unsubscribing only touches your own.
    const unsubscribe = (agent: Agent) =>
      agent.delete("/api/notifications/subscriptions").send({ endpoint: endpointOf("shared") });
    expect((await unsubscribe(alice.agent)).status).toBe(204);
    expect(await prisma.pushSubscription.count()).toBe(1);
    expect((await unsubscribe(bob.agent)).status).toBe(204);
    expect(await prisma.pushSubscription.count()).toBe(0);

    const invalid = await alice.agent
      .post("/api/notifications/subscriptions")
      .send({ endpoint: "http://insecure.example.com/x", keys: { p256dh: "a", auth: "b" } });
    expect(invalid.status).toBe(400);
    expect((await request(app).post("/api/notifications/subscriptions").send({})).status).toBe(401);
  });

  it("drops subscriptions the push service says are gone", async () => {
    const { members, group } = await subscribedGroup("alice", "bob", "carol");
    failing.set(endpointOf("alice"), 410);
    failing.set(endpointOf("carol"), 500);

    await uploadPhoto(members[0]!.agent, group.id);
    expect(await delivered()).toEqual([]);
    const left = await prisma.pushSubscription.findMany({ select: { endpoint: true } });
    expect(left.map((s) => s.endpoint).toSorted()).toEqual([endpointOf("bob"), endpointOf("carol")]);
  });
});

describe("notifications", () => {
  it("tell the rest of the group about a new photo", async () => {
    const { members, group } = await subscribedGroup("alice", "bob", "carol");
    const photo = await uploadPhoto(members[0]!.agent, group.id);

    await settleNotifications();
    expect(sent).toHaveLength(2);
    expect(sent[0]!.payload).toEqual({
      title: "🍻 The Boys",
      body: "Bob posted a photo",
      url: `/photos/${photo.id}`,
      tag: `photos:${group.id}`,
    });
    expect(await delivered()).toEqual(["alice: Bob posted a photo", "carol: Bob posted a photo"]);
  });

  it("skip muted groups, blocks, and kinds that are switched off", async () => {
    const { members, group } = await subscribedGroup("alice", "bob", "carol", "dave", "erin");
    const [bob, carol, dave, erin] = members as [(typeof members)[0], (typeof members)[0], (typeof members)[0], (typeof members)[0]];

    await carol.agent.patch(`/api/groups/${group.id}/members/me`).send({ muted: true });
    await dave.agent.put(`/api/users/me/blocks/${bob.user.id}`);
    await erin.agent.patch("/api/users/me/settings").send({ notifications: { photos: false } });
    await uploadPhoto(bob.agent, group.id);
    expect(await delivered()).toEqual(["alice: Bob posted a photo"]);

    await erin.agent.patch("/api/users/me/settings").send({ notifications: { photos: true, enabled: false } });
    await uploadPhoto(bob.agent, group.id);
    expect(await delivered()).toEqual(["alice: Bob posted a photo"]);
  });

  it("tell an uploader about reactions, once per change", async () => {
    const { owner: alice, members, group } = await subscribedGroup("alice", "bob");
    const bob = members[0]!;
    const photo = await uploadPhoto(alice.agent, group.id);
    await delivered();

    await bob.agent.put(`/api/photos/${photo.id}/reaction`).send({ type: "LAUGH" });
    await settleNotifications();
    expect(sent[0]!.payload).toEqual({
      title: "🍻 The Boys",
      body: "Bob reacted 😂 to your photo",
      url: `/photos/${photo.id}`,
      tag: `reactions:${photo.id}`,
    });
    expect(await delivered()).toEqual(["alice: Bob reacted 😂 to your photo"]);

    await bob.agent.put(`/api/photos/${photo.id}/reaction`).send({ type: "LAUGH" }); // the same again
    await alice.agent.put(`/api/photos/${photo.id}/reaction`).send({ type: "HEART" }); // your own photo
    expect(await delivered()).toEqual([]);
    await bob.agent.put(`/api/photos/${photo.id}/reaction`).send({ type: "FIRE" });
    expect(await delivered()).toEqual(["alice: Bob reacted 🔥 to your photo"]);
  });

  it("tell the uploader and earlier commenters about a comment", async () => {
    const { owner: alice, members, group } = await subscribedGroup("alice", "bob", "carol", "dave");
    const [bob, carol] = members as [(typeof members)[0], (typeof members)[0]];
    const photo = await uploadPhoto(alice.agent, group.id);
    await delivered();

    await carol.agent.post(`/api/photos/${photo.id}/comments`).send({ body: "Nice" });
    expect(await delivered()).toEqual(['alice: Carol commented: "Nice"']);

    const long = `${"a".repeat(78)}\n🔥🔥 and more`;
    await bob.agent.post(`/api/photos/${photo.id}/comments`).send({ body: long });
    const expected = `Bob commented: "${"a".repeat(78)} 🔥…"`;
    await settleNotifications();
    expect(sent[0]!.payload).toMatchObject({ url: `/photos/${photo.id}`, tag: `comments:${photo.id}` });
    expect(await delivered()).toEqual([`alice: ${expected}`, `carol: ${expected}`]);
  });

  it("tell members who asked about newcomers", async () => {
    const { owner: alice, members, group } = await subscribedGroup("alice", "bob");
    await members[0]!.agent.patch("/api/users/me/settings").send({ notifications: { members: true } });

    const peter = await signUp(app, "peter");
    await peter.agent.post(`/api/invites/${await createInvite(alice.agent, group.id)}/accept`);
    await settleNotifications();
    expect(sent.map((s) => s.payload)).toEqual([
      { title: "🍻 The Boys", body: "Peter joined The Boys", url: `/groups/${group.id}`, tag: `members:${group.id}` },
    ]);
    expect(await delivered()).toEqual(["bob: Peter joined The Boys"]);
  });
});

/** "HH:MM" in UTC, `minutes` from now. */
function utcClock(minutes: number) {
  const at = new Date(Date.now() + minutes * 60 * 1000);
  return `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`;
}

describe("quiet hours", () => {
  it("know when they end, past midnight too", () => {
    const settings = (timeZone: string | null, start: string, end: string) => ({
      ...toUserSettings(null),
      timeZone,
      notifications: { ...toUserSettings(null).notifications, quietHours: { enabled: true, start, end } },
    });
    const at = (iso: string) => new Date(iso);

    expect(quietHoursEnd(settings("UTC", "23:00", "08:00"), at("2026-03-01T23:30:00Z"))).toEqual(at("2026-03-02T08:00:00Z"));
    expect(quietHoursEnd(settings("UTC", "23:00", "08:00"), at("2026-03-01T07:59:00Z"))).toEqual(at("2026-03-01T08:00:00Z"));
    expect(quietHoursEnd(settings("UTC", "23:00", "08:00"), at("2026-03-01T08:00:00Z"))).toBeNull();
    expect(quietHoursEnd(settings("UTC", "13:00", "15:00"), at("2026-03-01T14:00:00Z"))).toEqual(at("2026-03-01T15:00:00Z"));
    // Bratislava is UTC+1 in winter.
    expect(quietHoursEnd(settings("Europe/Bratislava", "23:00", "08:00"), at("2026-01-10T22:30:00Z"))).toEqual(
      at("2026-01-11T07:00:00Z"),
    );
    // No time zone: no way to tell, so nothing is held back.
    expect(quietHoursEnd(settings(null, "00:00", "23:59"), at("2026-03-01T12:00:00Z"))).toBeNull();
  });

  it("hold notifications back until they end, keeping the latest per tag", async () => {
    const { owner: alice, members, group } = await subscribedGroup("alice", "bob");
    await alice.agent.patch("/api/users/me/settings").send({
      timeZone: "UTC",
      notifications: { quietHours: { enabled: true, start: utcClock(-60), end: utcClock(60) } },
    });

    await uploadPhoto(members[0]!.agent, group.id);
    await uploadPhoto(members[0]!.agent, group.id);
    expect(await delivered()).toEqual([]);
    const queued = await prisma.queuedNotification.findMany();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ userId: alice.user.id, body: "Bob posted a photo", tag: `photos:${group.id}` });
    const deliverAt = queued[0]!.deliverAt;
    expect(Math.abs(deliverAt.getTime() - (Date.now() + 60 * 60 * 1000))).toBeLessThan(2 * 60 * 1000);

    await runScheduledNotifications(new Date(deliverAt.getTime() - 1000));
    expect(await delivered()).toEqual([]);
    await runScheduledNotifications(deliverAt);
    expect(await delivered()).toEqual(["alice: Bob posted a photo"]);
    expect(await prisma.queuedNotification.count()).toBe(0);
  });
});

describe("scheduled notifications", () => {
  it("send On This Day once a day, from 09:00 in the person's zone", async () => {
    const { owner: alice, members, group } = await subscribedGroup("alice", "bob");
    await alice.agent.patch("/api/users/me/settings").send({ timeZone: "Europe/Bratislava" });
    await photoAt(alice.agent, group.id, "2025-10-07T12:00:00Z");
    await photoAt(members[0]!.agent, group.id, "2025-10-07T15:00:00Z");
    await photoAt(alice.agent, group.id, "2023-10-07T09:00:00Z");
    await photoAt(alice.agent, group.id, "2025-10-08T12:00:00Z"); // another day
    await delivered();

    await runScheduledNotifications(new Date("2026-10-07T06:30:00Z")); // 08:30 in Bratislava
    expect(await delivered()).toEqual([]);

    await runScheduledNotifications(new Date("2026-10-07T07:05:00Z")); // 09:05
    await settleNotifications();
    expect(sent.map((s) => s.payload)).toEqual([
      {
        title: "On this day",
        body: "3 photos from this day in 2023 and 2025",
        url: "/memories",
        tag: "on-this-day:2026-10-07",
      },
    ]);
    expect(await delivered()).toEqual(["alice: 3 photos from this day in 2023 and 2025"]);

    // Once a day; Bob has no time zone, so nothing is scheduled for him.
    await runScheduledNotifications(new Date("2026-10-07T10:00:00Z"));
    expect(await delivered()).toEqual([]);
    await runScheduledNotifications(new Date("2026-10-08T07:05:00Z"));
    expect(await delivered()).toEqual(["alice: 1 photo from this day in 2025"]);
  });

  it("announce last year's Wrapped on 1 January from 10:00, per group with photos", async () => {
    const { owner: alice, group } = await subscribedGroup("alice", "bob");
    await alice.agent.patch("/api/users/me/settings").send({ timeZone: "UTC" });
    await photoAt(alice.agent, group.id, "2026-06-01T12:00:00Z");
    await delivered();

    await runScheduledNotifications(new Date("2027-01-01T09:30:00Z"));
    expect(await delivered()).toEqual([]);
    await runScheduledNotifications(new Date("2027-01-01T10:01:00Z"));
    await settleNotifications();
    expect(sent.map((s) => s.payload)).toEqual([
      {
        title: "🍻 The Boys",
        body: "Your 2026 Wrapped for The Boys is ready",
        url: `/wrapped/2026?group=${group.id}`,
        tag: `wrapped:${group.id}:2026`,
      },
    ]);
    await delivered();
    await runScheduledNotifications(new Date("2027-01-01T15:00:00Z"));
    expect(await delivered()).toEqual([]);
  });
});

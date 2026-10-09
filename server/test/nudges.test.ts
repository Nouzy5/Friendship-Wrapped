import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { setApnsSender, type ApnsTarget } from "../src/lib/apns.js";
import { prisma } from "../src/lib/prisma.js";
import { setPushSender, type PushPayload, type PushTarget } from "../src/lib/push.js";
import { runScheduledNotifications } from "../src/modules/notifications/notification-scheduler.js";
import { settleNotifications } from "../src/modules/notifications/notifications.service.js";
import { createGroup, createInvite, groupWith, photoAt, resetDatabase, resetStorage, signUp, type Agent } from "./helpers.js";

const app = createApp();

/** What the fake push service received, by the endpoint's last part (the username). */
let sent: { to: string; payload: PushPayload }[] = [];
async function fakeSender(target: PushTarget, payload: PushPayload) {
  sent.push({ to: target.endpoint.split("/").at(-1)!, payload });
}

beforeEach(async () => {
  await resetDatabase();
  await resetStorage();
  sent = [];
  setPushSender(null); // set-up posts photos, which would notify; the tests switch it on afterwards
});

afterEach(async () => {
  await settleNotifications();
  setPushSender(null);
  setApnsSender(null);
});

afterAll(async () => {
  await resetDatabase();
  await resetStorage();
  await prisma.$disconnect();
});

const DAY = 24 * 60 * 60 * 1000;
/** Friday 9 October 2026, 17:30 UTC: inside the evening window for someone in UTC. */
const NOW = new Date("2026-10-09T17:30:00Z");
const ago = (days: number, from = NOW) => new Date(from.getTime() - days * DAY).toISOString();

function subscribe(agent: Agent, username: string) {
  return agent.post("/api/notifications/subscriptions").send({
    endpoint: `https://push.example.com/send/${username}`,
    keys: { p256dh: `BKey-${username}`, auth: `auth-${username}` },
  });
}

/** Everyone has been in the group for a month, and the named people can be pushed to. */
async function setUp(...usernames: string[]) {
  const setup = await groupWith(app, ...usernames);
  const everyone = [setup.owner, ...setup.members];
  await prisma.groupMember.updateMany({ data: { joinedAt: new Date(NOW.getTime() - 30 * DAY) } });
  for (const [index, person] of everyone.entries()) {
    await subscribe(person.agent, usernames[index]!);
    await person.agent.patch("/api/users/me/settings").send({ timeZone: "UTC" });
  }
  return { ...setup, everyone };
}

/** Switches the fake push service on, runs the scheduler at `at`, and returns what was sent to whom. */
async function nudgesAt(at: Date) {
  setPushSender(fakeSender);
  await runScheduledNotifications(at);
  await settleNotifications();
  setPushSender(null);
  const result = sent.filter(({ payload }) => payload.tag.startsWith("nudge:"));
  sent = [];
  return result;
}

describe("nudges", () => {
  it("remind someone who hasn't posted for a while, about a group where friends have", async () => {
    const { members, group } = await setUp("alice", "bob");
    await photoAt(members[0]!.agent, group.id, ago(3));

    const nudges = await nudgesAt(NOW);

    expect(nudges).toEqual([
      {
        to: "alice",
        payload: {
          title: "🍻 The Boys",
          body: "Got a moment from this week? Share it with The Boys 📸",
          url: `/camera?group=${group.id}`,
          tag: `nudge:${group.id}`,
        },
      },
    ]);
  });

  it("never name anyone, or say who has or hasn't posted", async () => {
    const { members, group } = await setUp("alice", "bob", "carol", "dave");
    await photoAt(members[0]!.agent, group.id, ago(2)); // bob posted; carol and dave haven't, nor has alice

    const nudges = await nudgesAt(NOW);
    expect(nudges.map(({ to }) => to).toSorted()).toEqual(["alice", "carol", "dave"]);
    for (const { payload } of nudges) {
      const text = JSON.stringify(payload).toLowerCase();
      for (const name of ["alice", "bob", "carol", "dave", "hasn't", "haven't", "yet", "missing", "everyone", "only you"]) {
        expect(text, name).not.toContain(name);
      }
    }
  });

  it("go out at most once a fortnight, whatever the group", async () => {
    const { owner: alice, members, group } = await setUp("alice", "bob");
    const bob = members[0]!;
    const other = await createGroup(alice.agent, { name: "Work", emoji: "💼" });
    await prisma.groupMember.updateMany({ data: { joinedAt: new Date(NOW.getTime() - 30 * DAY) } });
    const colleague = await signUp(app, "carol");
    await colleague.agent.post(`/api/invites/${await createInvite(alice.agent, other.id)}/accept`);
    await prisma.groupMember.updateMany({ data: { joinedAt: new Date(NOW.getTime() - 30 * DAY) } });

    await photoAt(bob.agent, group.id, ago(3));
    await photoAt(colleague.agent, other.id, ago(3));
    expect((await nudgesAt(NOW)).map(({ to }) => to)).toEqual(["alice"]);

    // Every day for the next 13 days, with new photos all the while: not again.
    for (let day = 1; day <= 13; day++) {
      const at = new Date(NOW.getTime() + day * DAY);
      await photoAt(bob.agent, group.id, ago(1, at));
      expect(await nudgesAt(at), `day ${day}`).toEqual([]);
    }

    // A fortnight later: ready for another.
    const later = new Date(NOW.getTime() + 14 * DAY);
    await photoAt(bob.agent, group.id, ago(1, later));
    expect((await nudgesAt(later)).map(({ to }) => to)).toEqual(["alice"]);
  });

  it("are checked once a day, not every minute", async () => {
    const { members, group } = await setUp("alice", "bob");

    // Nothing to nudge about at 17:00…
    expect(await nudgesAt(new Date("2026-10-09T17:00:00Z"))).toEqual([]);
    await photoAt(members[0]!.agent, group.id, ago(1)); // …and something by 18:00, but today's look is done.
    expect(await nudgesAt(new Date("2026-10-09T18:00:00Z"))).toEqual([]);
    // Tomorrow it looks again.
    expect((await nudgesAt(new Date("2026-10-10T17:00:00Z"))).map(({ to }) => to)).toEqual(["alice"]);
  });

  it("only go out in the early evening, in the person's own time zone", async () => {
    const { owner: alice, members, group } = await setUp("alice", "bob");
    await alice.agent.patch("/api/users/me/settings").send({ timeZone: "Asia/Tokyo" }); // UTC+9
    await photoAt(members[0]!.agent, group.id, ago(2));

    // 17:30 UTC is 02:30 in Tokyo.
    expect(await nudgesAt(NOW)).toEqual([]);
    // 16:59 and 20:00 local are outside the window; 17:00 is in.
    expect(await nudgesAt(new Date("2026-10-10T07:59:00Z"))).toEqual([]);
    expect(await nudgesAt(new Date("2026-10-10T11:00:00Z"))).toEqual([]);
    expect((await nudgesAt(new Date("2026-10-10T08:00:00Z"))).map(({ to }) => to)).toEqual(["alice"]);
  });

  it("skip people who posted anywhere in the last 10 days", async () => {
    const { owner: alice, members, group } = await setUp("alice", "bob");
    await photoAt(members[0]!.agent, group.id, ago(2));
    await photoAt(alice.agent, group.id, ago(9));
    expect(await nudgesAt(NOW)).toEqual([]);

    // Posted 11 days ago: that's long enough.
    await prisma.photo.updateMany({ where: { uploaderId: alice.user.id }, data: { createdAt: new Date(NOW.getTime() - 11 * DAY) } });
    expect((await nudgesAt(new Date(NOW.getTime() + DAY))).map(({ to }) => to)).toEqual(["alice"]);
  });

  it("count a post in another group as posting", async () => {
    const { owner: alice, members, group } = await setUp("alice", "bob");
    const other = await createGroup(alice.agent, { name: "Work", emoji: "💼" });
    await photoAt(members[0]!.agent, group.id, ago(2));
    await photoAt(alice.agent, other.id, ago(4));

    expect(await nudgesAt(NOW)).toEqual([]);
  });

  it("skip a group where nobody else has posted lately, and don't use up the fortnight", async () => {
    const { members, group } = await setUp("alice", "bob");
    await photoAt(members[0]!.agent, group.id, ago(15));
    expect(await nudgesAt(NOW)).toEqual([]);
    expect((await prisma.userSettings.findMany()).map((s) => s.nudgedAt)).toEqual([null, null]);

    // Friends post again: the next day she is nudged.
    await photoAt(members[0]!.agent, group.id, ago(0));
    expect((await nudgesAt(new Date(NOW.getTime() + DAY))).map(({ to }) => to)).toEqual(["alice"]);
  });

  it("skip groups the person joined within the last week, or has muted", async () => {
    const { owner: alice, members, group } = await setUp("alice", "bob");
    await photoAt(members[0]!.agent, group.id, ago(1));

    await prisma.groupMember.updateMany({ where: { userId: alice.user.id }, data: { joinedAt: new Date(NOW.getTime() - 6 * DAY) } });
    expect(await nudgesAt(NOW)).toEqual([]);

    await prisma.groupMember.updateMany({ where: { userId: alice.user.id }, data: { joinedAt: new Date(NOW.getTime() - 8 * DAY) } });
    await alice.agent.patch(`/api/groups/${group.id}/members/me`).send({ muted: true });
    expect(await nudgesAt(new Date(NOW.getTime() + DAY))).toEqual([]);

    await alice.agent.patch(`/api/groups/${group.id}/members/me`).send({ muted: false });
    expect((await nudgesAt(new Date(NOW.getTime() + 2 * DAY))).map(({ to }) => to)).toEqual(["alice"]);
  });

  it("pick the group where friends posted most recently", async () => {
    const { owner: alice, members, group } = await setUp("alice", "bob");
    const work = await createGroup(alice.agent, { name: "Work", emoji: "💼" });
    const colleague = await signUp(app, "carol");
    await colleague.agent.post(`/api/invites/${await createInvite(alice.agent, work.id)}/accept`);
    await prisma.groupMember.updateMany({ data: { joinedAt: new Date(NOW.getTime() - 30 * DAY) } });
    await photoAt(members[0]!.agent, group.id, ago(6));
    await photoAt(colleague.agent, work.id, ago(1));

    const [nudge] = await nudgesAt(NOW);
    expect(nudge!.payload).toMatchObject({ title: "💼 Work", url: `/camera?group=${work.id}` });
  });

  it("can be switched off, or paused with all notifications", async () => {
    const { owner: alice, members, group } = await setUp("alice", "bob", "carol");
    await photoAt(members[0]!.agent, group.id, ago(2));
    await alice.agent.patch("/api/users/me/settings").send({ notifications: { nudges: false } });
    await members[1]!.agent.patch("/api/users/me/settings").send({ notifications: { enabled: false } });

    expect(await nudgesAt(NOW)).toEqual([]);
    expect((await alice.agent.get("/api/users/me/settings")).body.settings.notifications).toMatchObject({ nudges: false });

    await alice.agent.patch("/api/users/me/settings").send({ notifications: { nudges: true } });
    expect((await nudgesAt(new Date(NOW.getTime() + DAY))).map(({ to }) => to)).toEqual(["alice"]);
  });

  it("are on by default", async () => {
    const alice = await signUp(app, "alice");

    expect((await alice.agent.get("/api/users/me/settings")).body.settings.notifications.nudges).toBe(true);
  });

  it("wait out quiet hours like any other notification", async () => {
    const { owner: alice, members, group } = await setUp("alice", "bob");
    await photoAt(members[0]!.agent, group.id, ago(2));
    await alice.agent.patch("/api/users/me/settings").send({ notifications: { quietHours: { enabled: true, start: "17:00", end: "19:00" } } });

    expect(await nudgesAt(NOW)).toEqual([]);
    const [queued] = await prisma.queuedNotification.findMany();
    expect(queued).toMatchObject({ tag: `nudge:${group.id}`, deliverAt: new Date("2026-10-09T19:00:00Z") });
  });

  it("send only one when two schedulers run at the same moment", async () => {
    const { members, group } = await setUp("alice", "bob");
    await photoAt(members[0]!.agent, group.id, ago(2));

    setPushSender(fakeSender);
    await Promise.all([runScheduledNotifications(NOW), runScheduledNotifications(NOW)]);
    await settleNotifications();

    expect(sent.filter(({ payload }) => payload.tag.startsWith("nudge:"))).toHaveLength(1);
  });

  it("reach someone with only an iPhone", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    await prisma.groupMember.updateMany({ data: { joinedAt: new Date(NOW.getTime() - 30 * DAY) } });
    await alice.agent.patch("/api/users/me/settings").send({ timeZone: "UTC" });
    await alice.agent.post("/api/notifications/devices").send({ token: "ab".repeat(32), environment: "production" });
    await photoAt(members[0]!.agent, group.id, ago(2));

    const received: { target: ApnsTarget; payload: PushPayload }[] = [];
    setApnsSender(async (target, payload) => {
      received.push({ target, payload });
    });
    await runScheduledNotifications(NOW);
    await settleNotifications();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      target: { token: "ab".repeat(32), environment: "PRODUCTION" },
      payload: { url: `/camera?group=${group.id}` },
    });
  });

  it("need a time zone, which tells when evening is", async () => {
    const { owner: alice, members, group } = await setUp("alice", "bob");
    await prisma.userSettings.updateMany({ where: { userId: alice.user.id }, data: { timeZone: null } });
    await photoAt(members[0]!.agent, group.id, ago(2));

    expect(await nudgesAt(NOW)).toEqual([]);
  });
});

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { weekStartOf } from "../src/lib/time-zone.js";
import { getPulse } from "../src/modules/pulse/pulse.service.js";
import { commentAt, groupWith, photoAt, reactAt, resetDatabase, resetStorage, signUp, uploadPhoto } from "./helpers.js";

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

const pulseUrl = (groupId: string, tz = "Europe/Bratislava") => `/api/groups/${groupId}/pulse?tz=${encodeURIComponent(tz)}`;

describe("weekStartOf", () => {
  it("finds the Monday of the week, Sunday included", () => {
    expect(weekStartOf({ year: 2026, month: 10, day: 5 })).toEqual({ year: 2026, month: 10, day: 5 }); // a Monday
    expect(weekStartOf({ year: 2026, month: 10, day: 9 })).toEqual({ year: 2026, month: 10, day: 5 });
    expect(weekStartOf({ year: 2026, month: 10, day: 11 })).toEqual({ year: 2026, month: 10, day: 5 }); // the Sunday
    expect(weekStartOf({ year: 2026, month: 10, day: 12 })).toEqual({ year: 2026, month: 10, day: 12 });
    // Across a month and a year.
    expect(weekStartOf({ year: 2027, month: 1, day: 1 })).toEqual({ year: 2026, month: 12, day: 28 });
    expect(weekStartOf({ year: 2026, month: 3, day: 1 })).toEqual({ year: 2026, month: 2, day: 23 });
  });
});

describe("the group pulse", () => {
  it("is for members only", async () => {
    const { group } = await groupWith(app, "alice");
    const stranger = await signUp(app, "mallory");

    expect((await stranger.agent.get(pulseUrl(group.id))).status).toBe(404);
    expect((await request(app).get(pulseUrl(group.id))).status).toBe(401);
  });

  it("needs a real time zone", async () => {
    const { owner, group } = await groupWith(app, "alice");

    expect((await owner.agent.get(`/api/groups/${group.id}/pulse`)).status).toBe(400);
    expect((await owner.agent.get(pulseUrl(group.id, "Mars/Olympus_Mons"))).status).toBe(400);
    expect((await owner.agent.get(pulseUrl(group.id, "Europe/Bratislava"))).status).toBe(200);
  });

  it("counts this month's photos, reactions and comments", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const now = new Date();
    const earlier = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 90).toISOString();

    const old = await photoAt(alice.agent, group.id, earlier); // posted long ago…
    await uploadPhoto(alice.agent, group.id);
    const fresh = await uploadPhoto(bob.agent, group.id);
    await bob.agent.put(`/api/photos/${old.id}/reaction`).send({ type: "HEART" }); // …but reacted to now
    await alice.agent.put(`/api/photos/${fresh.id}/reaction`).send({ type: "FIRE" });
    await alice.agent.post(`/api/photos/${fresh.id}/comments`).send({ body: "Nice" });

    const res = await bob.agent.get(pulseUrl(group.id, "UTC"));
    expect(res.status).toBe(200);
    expect(res.body.pulse).toMatchObject({
      timeZone: "UTC",
      month: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, photos: 2, reactions: 2, comments: 1 },
    });
  });

  it("takes the month in the viewer's own time zone", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    // 23:30 UTC on the last day of September is already October in Bratislava (UTC+2 until late October).
    await photoAt(alice.agent, group.id, "2026-09-30T23:30:00Z");
    await photoAt(members[0]!.agent, group.id, "2026-10-15T10:00:00Z");

    const now = new Date("2026-10-20T12:00:00Z");
    const bratislava = await getPulse(group.id, alice.user.id, "Europe/Bratislava", now);
    const utc = await getPulse(group.id, alice.user.id, "UTC", now);
    const honolulu = await getPulse(group.id, alice.user.id, "Pacific/Honolulu", now);

    expect(bratislava.month).toMatchObject({ year: 2026, month: 10, photos: 2 });
    expect(bratislava.month.from).toEqual(new Date("2026-09-30T22:00:00Z"));
    expect(utc.month.photos).toBe(1);
    expect(honolulu.month.photos).toBe(1);
  });

  it("holds nothing about individual people, so it can't show who hasn't posted", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob", "carol");
    await uploadPhoto(members[0]!.agent, group.id);

    const res = await owner.agent.get(pulseUrl(group.id));
    expect(Object.keys(res.body.pulse).toSorted()).toEqual(["month", "streak", "timeZone"]);
    expect(Object.keys(res.body.pulse.month).toSorted()).toEqual(["comments", "from", "month", "photos", "reactions", "to", "year"]);
    expect(Object.keys(res.body.pulse.streak).toSorted()).toEqual(["thisWeekDone", "weeks"]);
    const text = JSON.stringify(res.body).toLowerCase();
    for (const name of ["alice", "bob", "carol", members[0]!.user.id, owner.user.id]) expect(text).not.toContain(name);
  });

  it("is all zeros for a quiet group", async () => {
    const { owner, group } = await groupWith(app, "alice");

    const res = await owner.agent.get(pulseUrl(group.id));
    expect(res.body.pulse.month).toMatchObject({ photos: 0, reactions: 0, comments: 0 });
    expect(res.body.pulse.streak).toEqual({ weeks: 0, thisWeekDone: false });
  });

  it("counts reactions and comments of this month made on older photos, and leaves other groups out", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const photo = await photoAt(alice.agent, group.id, "2026-01-05T10:00:00Z");
    await reactAt(bob.agent, bob.user.id, photo.id, "LAUGH", "2026-10-02T10:00:00Z");
    await commentAt(bob.agent, photo.id, "2026-09-28T10:00:00Z"); // last month: not counted

    // Another group's activity doesn't leak in.
    const other = await groupWith(app, "carol");
    await photoAt(other.owner.agent, other.group.id, "2026-10-03T10:00:00Z");

    const pulse = await getPulse(group.id, alice.user.id, "UTC", new Date("2026-10-09T12:00:00Z"));
    expect(pulse.month).toMatchObject({ photos: 0, reactions: 1, comments: 0 });
  });
});

describe("the weekly streak", () => {
  // Friday 9 October 2026. Weeks run Monday to Sunday: this one began on Monday 5 October.
  const NOW = new Date("2026-10-09T12:00:00Z");

  async function streakAfter(...photoTimes: string[]) {
    await resetDatabase(); // a test may ask more than once
    const { owner, group } = await groupWith(app, "alice");
    for (const at of photoTimes) await photoAt(owner.agent, group.id, at);
    return (await getPulse(group.id, owner.user.id, "UTC", NOW)).streak;
  }

  it("counts weeks in a row with a photo, this one included", async () => {
    expect(await streakAfter("2026-10-07T10:00:00Z", "2026-10-01T10:00:00Z", "2026-09-22T10:00:00Z")).toEqual({
      weeks: 3,
      thisWeekDone: true,
    });
  });

  it("stays alive through a week that isn't over yet, counting up to last week", async () => {
    expect(await streakAfter("2026-10-02T10:00:00Z", "2026-09-24T10:00:00Z")).toEqual({ weeks: 2, thisWeekDone: false });
  });

  it("is broken by a whole week without a photo", async () => {
    // Nothing the week of 28 September to 4 October, so only this week counts.
    expect(await streakAfter("2026-10-06T10:00:00Z", "2026-09-22T10:00:00Z")).toEqual({ weeks: 1, thisWeekDone: true });
    // Nothing this week or last: over.
    expect(await streakAfter("2026-09-22T10:00:00Z", "2026-09-15T10:00:00Z")).toEqual({ weeks: 0, thisWeekDone: false });
  });

  it("counts one photo or many the same, from anyone", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    await photoAt(members[0]!.agent, group.id, "2026-10-07T10:00:00Z");
    await photoAt(alice.agent, group.id, "2026-10-08T10:00:00Z");
    await photoAt(alice.agent, group.id, "2026-10-01T10:00:00Z");
    await photoAt(members[0]!.agent, group.id, "2026-10-01T11:00:00Z");

    expect((await getPulse(group.id, alice.user.id, "UTC", NOW)).streak).toEqual({ weeks: 2, thisWeekDone: true });
  });

  it("starts weeks on Monday at midnight in the viewer's zone", async () => {
    // Sunday 4 October 23:30 UTC is already Monday 5 October in Bratislava (UTC+2): the new week.
    const { owner, group } = await groupWith(app, "alice");
    await photoAt(owner.agent, group.id, "2026-10-04T23:30:00Z");

    const now = new Date("2026-10-09T12:00:00Z");
    // In UTC it is still Sunday, so last week's: this week has no photo yet but the streak is alive.
    expect((await getPulse(group.id, owner.user.id, "UTC", now)).streak).toEqual({ weeks: 1, thisWeekDone: false });
    // In Bratislava it is this week's: done, and last week was empty.
    expect((await getPulse(group.id, owner.user.id, "Europe/Bratislava", now)).streak).toEqual({ weeks: 1, thisWeekDone: true });
  });

  it("is the same for everyone in the group", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    await photoAt(alice.agent, group.id, "2026-10-07T10:00:00Z");
    await photoAt(alice.agent, group.id, "2026-09-30T10:00:00Z");

    const a = await getPulse(group.id, alice.user.id, "UTC", NOW);
    const b = await getPulse(group.id, members[0]!.user.id, "UTC", NOW);
    expect(b.streak).toEqual(a.streak);
  });

  it("keeps counting past the batch it looks up at once", async () => {
    const { owner, group } = await groupWith(app, "alice");
    // A photo in each of 20 weeks in a row, ending with this one.
    for (let week = 0; week < 20; week++) {
      await photoAt(owner.agent, group.id, new Date(Date.parse("2026-10-07T10:00:00Z") - week * 7 * 24 * 60 * 60 * 1000).toISOString());
    }

    expect((await getPulse(group.id, owner.user.id, "UTC", NOW)).streak).toEqual({ weeks: 20, thisWeekDone: true });
  });

  it("is right across the clocks changing", async () => {
    // Europe/Bratislava goes back an hour on Sunday 25 October 2026, making that week 169 hours long.
    const { owner, group } = await groupWith(app, "alice");
    for (const at of ["2026-10-27T10:00:00Z", "2026-10-20T10:00:00Z", "2026-10-13T10:00:00Z"]) await photoAt(owner.agent, group.id, at);

    const now = new Date("2026-10-28T12:00:00Z");
    expect((await getPulse(group.id, owner.user.id, "Europe/Bratislava", now)).streak).toEqual({ weeks: 3, thisWeekDone: true });
  });
});

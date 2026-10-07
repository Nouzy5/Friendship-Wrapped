import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { groupWith, resetDatabase, resetStorage, signUp, uploadPhoto, type Agent } from "./helpers.js";

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

/** Posts a photo, then backdates it (uploads are always "now"). */
async function photoAt(agent: Agent, groupId: string, at: string) {
  const photo = await uploadPhoto(agent, groupId);
  await prisma.photo.update({ where: { id: photo.id }, data: { createdAt: new Date(at) } });
  return photo;
}

async function reactAt(agent: Agent, userId: string, photoId: string, type: string, at: string) {
  expect((await agent.put(`/api/photos/${photoId}/reaction`).send({ type })).status).toBe(200);
  await prisma.reaction.update({
    where: { photoId_userId: { photoId, userId } },
    data: { createdAt: new Date(at) },
  });
}

async function commentAt(agent: Agent, photoId: string, at: string) {
  const res = await agent.post(`/api/photos/${photoId}/comments`).send({ body: "🔥" });
  expect(res.status).toBe(201);
  await prisma.comment.update({ where: { id: res.body.comment.id }, data: { createdAt: new Date(at) } });
}

function statsOf(agent: Agent, groupId: string, year: number | string, tz = "Europe/Bratislava") {
  return agent.get(`/api/groups/${groupId}/stats/${year}?tz=${encodeURIComponent(tz)}`);
}

type Ranked = { user: { username: string }; count: number }[];
const usernames = (ranked: Ranked) => ranked.map(({ user, count }) => [user.username, count]);

describe("a group's year in numbers", () => {
  async function busyYear() {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob", "carol", "dave", "erin");
    const [bob, carol, dave] = members as [(typeof members)[0], (typeof members)[0], (typeof members)[0]];

    const old = await photoAt(alice.agent, group.id, "2024-06-01T10:00:00Z");
    const january = await photoAt(bob.agent, group.id, "2025-01-05T10:00:00Z");
    const march = await photoAt(alice.agent, group.id, "2025-03-10T10:00:00Z");
    // 31 July in UTC, but 00:30 on 1 August in Bratislava (UTC+2 in summer).
    const lateNight = await photoAt(bob.agent, group.id, "2025-07-31T22:30:00Z");
    const popular = await photoAt(alice.agent, group.id, "2025-08-01T10:00:00Z");
    const talkedAbout = await photoAt(bob.agent, group.id, "2025-08-01T12:00:00Z");
    // New Year's Eve in UTC, but already 2026 in Bratislava.
    await photoAt(carol.agent, group.id, "2025-12-31T23:30:00Z");

    await reactAt(dave.agent, dave.user.id, popular.id, "HEART", "2025-08-02T09:00:00Z");
    await reactAt(bob.agent, bob.user.id, popular.id, "FIRE", "2025-08-02T10:00:00Z");
    await reactAt(carol.agent, carol.user.id, popular.id, "LAUGH", "2025-08-03T10:00:00Z");
    await reactAt(alice.agent, alice.user.id, lateNight.id, "HEART", "2025-08-01T08:00:00Z");
    await reactAt(alice.agent, alice.user.id, old.id, "HEART", "2025-02-01T10:00:00Z"); // given in 2025, old photo
    await reactAt(bob.agent, bob.user.id, old.id, "SKULL", "2024-06-02T10:00:00Z"); // given in 2024

    await commentAt(carol.agent, talkedAbout.id, "2025-08-05T10:00:00Z");
    await commentAt(carol.agent, talkedAbout.id, "2025-08-06T10:00:00Z");
    await commentAt(bob.agent, march.id, "2025-03-11T10:00:00Z");
    await commentAt(alice.agent, talkedAbout.id, "2026-01-10T10:00:00Z"); // written in 2026

    // Leaving doesn't erase what someone did that year.
    expect((await carol.agent.post(`/api/groups/${group.id}/leave`)).status).toBe(200);

    return { alice, group, photos: { january, march, lateNight, popular, talkedAbout } };
  }

  it("counts everything the Wrapped slides need, in the viewer's time zone", async () => {
    const { alice, group, photos } = await busyYear();

    const res = await statsOf(alice.agent, group.id, 2025);
    expect(res.status).toBe(200);
    const { stats } = res.body;

    expect(stats).toMatchObject({
      group: { id: group.id, name: "The Boys", emoji: "🍻" },
      year: 2025,
      timeZone: "Europe/Bratislava",
      from: "2024-12-31T23:00:00.000Z", // midnight in Bratislava (UTC+1 in winter)
      to: "2025-12-31T23:00:00.000Z",
      memberCount: 4, // Carol left
      activeUserCount: 4, // Alice, Bob, Carol and Dave; Erin did nothing
    });

    expect(stats.photos.total).toBe(5);
    expect(stats.photos.byMonth).toEqual([1, 0, 1, 0, 0, 0, 0, 3, 0, 0, 0, 0]);
    expect(stats.photos.mostActiveMonth).toEqual({ month: 8, count: 3 });
    expect(stats.photos.mostActiveDay).toEqual({ date: "2025-08-01", count: 3 });
    expect(usernames(stats.photos.byUser)).toEqual([
      ["bob", 3],
      ["alice", 2],
    ]);
    expect(stats.photos.topPhotographer).toMatchObject({ user: { username: "bob" }, count: 3 });

    expect(stats.reactions.total).toBe(5);
    expect(usernames(stats.reactions.byUser)).toEqual([
      ["alice", 2],
      ["bob", 1],
      ["carol", 1],
      ["dave", 1],
    ]);
    expect(stats.reactions.mostReactedPhoto).toMatchObject({
      photo: { id: photos.popular.id, reactions: { total: 3, counts: { HEART: 1, FIRE: 1, LAUGH: 1 } } },
      count: 3,
    });

    expect(stats.comments.total).toBe(3);
    expect(usernames(stats.comments.byUser)).toEqual([
      ["carol", 2],
      ["bob", 1],
    ]);

    // Most reactions + comments first; on a tie, the earlier photo.
    expect(stats.highlights.map((photo: { id: string }) => photo.id)).toEqual([
      photos.popular.id, // 3 reactions
      photos.talkedAbout.id, // 3 comments, posted later the same day
      photos.march.id, // 1 comment
      photos.lateNight.id, // 1 reaction
      photos.january.id,
    ]);
  });

  it("moves the edges of days, months and the year with the time zone", async () => {
    const { alice, group } = await busyYear();

    const { stats } = (await statsOf(alice.agent, group.id, 2025, "UTC")).body;
    expect(stats.photos.total).toBe(6); // the New Year's Eve photo is still 2025 in UTC
    expect(stats.photos.byMonth).toEqual([1, 0, 1, 0, 0, 0, 1, 2, 0, 0, 0, 1]);
    expect(stats.photos.mostActiveMonth).toEqual({ month: 8, count: 2 });
    expect(stats.photos.mostActiveDay).toEqual({ date: "2025-08-01", count: 2 });
    // Carol's New Year's Eve photo now counts for her.
    expect(usernames(stats.photos.byUser)).toEqual([
      ["bob", 3],
      ["alice", 2],
      ["carol", 1],
    ]);
  });

  it("gives the top photographer to whoever posted first that year when it's a tie", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    await photoAt(bob.agent, group.id, "2025-02-01T10:00:00Z");
    await photoAt(alice.agent, group.id, "2025-03-01T10:00:00Z");
    await photoAt(alice.agent, group.id, "2025-04-01T10:00:00Z");
    await photoAt(bob.agent, group.id, "2025-05-01T10:00:00Z");

    const { stats } = (await statsOf(alice.agent, group.id, 2025)).body;
    expect(stats.photos.topPhotographer).toMatchObject({ user: { username: "bob" }, count: 2 });
  });

  it("is all zeros for a year with nothing in it", async () => {
    const { owner, group } = await groupWith(app, "alice");
    await photoAt(owner.agent, group.id, "2025-05-01T10:00:00Z");

    const { stats } = (await statsOf(owner.agent, group.id, 2023)).body;
    expect(stats).toMatchObject({
      memberCount: 1,
      activeUserCount: 0,
      photos: {
        total: 0,
        byMonth: Array(12).fill(0),
        byUser: [],
        topPhotographer: null,
        mostActiveMonth: null,
        mostActiveDay: null,
      },
      reactions: { total: 0, byUser: [], mostReactedPhoto: null },
      comments: { total: 0, byUser: [] },
      highlights: [],
    });
  });

  it("is for members only, and validates the year and time zone", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const carol = await signUp(app, "carol");

    expect((await statsOf(carol.agent, group.id, 2025)).status).toBe(404);
    expect((await request(app).get(`/api/groups/${group.id}/stats/2025?tz=UTC`)).status).toBe(401);
    expect((await statsOf(owner.agent, group.id, 1999)).status).toBe(400);
    expect((await statsOf(owner.agent, group.id, "last-year")).status).toBe(400);
    expect((await statsOf(owner.agent, group.id, 2025, "Mars/Olympus")).status).toBe(400);
    expect((await owner.agent.get(`/api/groups/${group.id}/stats/2025`)).status).toBe(400);
  });
});

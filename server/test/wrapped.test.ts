import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  commentAt,
  createGroup,
  createInvite,
  groupWith,
  photoAt,
  reactAt,
  resetDatabase,
  resetStorage,
  signUp,
  uploadPhoto,
  type Agent,
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

const BRATISLAVA = "Europe/Bratislava";

function wrappedOf(agent: Agent, groupId: string, year: number | string, tz = BRATISLAVA) {
  return agent.get(`/api/groups/${groupId}/wrapped/${year}?tz=${encodeURIComponent(tz)}`);
}

function listWrapped(agent: Agent, tz = BRATISLAVA) {
  return agent.get(`/api/wrapped?tz=${encodeURIComponent(tz)}`);
}

type Slide = { type: string; [key: string]: unknown };
type Wrapped = { slides: Slide[]; generatedAt: string; final: boolean };

const types = (wrapped: Wrapped) => wrapped.slides.map((slide) => slide.type);

function slide(wrapped: Wrapped, type: string): any {
  const found = wrapped.slides.find((candidate) => candidate.type === type);
  if (!found) throw new Error(`No ${type} slide`);
  return found;
}

/** The year it is now in the zone. */
const thisYear = (timeZone: string) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(new Date()));

describe("a group's Wrapped", () => {
  it("tells a finished year as a story, in the spec's order", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob", "carol", "dave");
    const [bob, carol, dave] = members as [(typeof members)[0], (typeof members)[0], (typeof members)[0]];

    const january = await photoAt(alice.agent, group.id, "2025-01-05T10:00:00Z");
    const popular = await photoAt(bob.agent, group.id, "2025-08-01T10:00:00Z");
    const talkedAbout = await photoAt(bob.agent, group.id, "2025-08-01T12:00:00Z");
    const quiet = await photoAt(carol.agent, group.id, "2025-08-20T12:00:00Z");
    await reactAt(alice.agent, alice.user.id, popular.id, "HEART", "2025-08-02T09:00:00Z");
    await reactAt(dave.agent, dave.user.id, popular.id, "FIRE", "2025-08-02T10:00:00Z");
    await reactAt(dave.agent, dave.user.id, january.id, "LAUGH", "2025-01-06T10:00:00Z");
    await commentAt(carol.agent, talkedAbout.id, "2025-08-05T10:00:00Z");

    const res = await wrappedOf(alice.agent, group.id, 2025);
    expect(res.status).toBe(200);
    const { wrapped } = res.body;
    expect(wrapped).toMatchObject({
      group: { id: group.id, name: "The Boys", emoji: "🍻" },
      year: 2025,
      timeZone: BRATISLAVA,
      final: true,
    });

    expect(types(wrapped)).toEqual([
      "intro",
      "photos",
      "topPhotographer",
      "busiestMonth",
      "mostReactedPhoto",
      "reactions",
      "collage",
      "outro",
    ]);
    expect(slide(wrapped, "photos")).toEqual({ type: "photos", total: 4, photographerCount: 3 });
    expect(slide(wrapped, "topPhotographer")).toMatchObject({
      top: { user: { username: "bob", displayName: "Bob" }, count: 2 },
      // Tied on one photo each: whoever posted first that year comes first.
      runnersUp: [
        { user: { username: "alice" }, count: 1 },
        { user: { username: "carol" }, count: 1 },
      ],
    });
    expect(slide(wrapped, "busiestMonth")).toEqual({
      type: "busiestMonth",
      month: 8,
      count: 3,
      byMonth: [1, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0],
      busiestDay: { date: "2025-08-01", count: 2 },
    });
    expect(slide(wrapped, "mostReactedPhoto")).toMatchObject({
      photo: { id: popular.id, imageUrls: { medium: expect.any(String) } },
      count: 2,
    });
    expect(slide(wrapped, "reactions")).toMatchObject({
      total: 3,
      comments: 1,
      topReactor: { user: { username: "dave" }, count: 2 },
    });
    expect(slide(wrapped, "collage").photos.map((photo: { id: string }) => photo.id)).toEqual([
      popular.id,
      january.id, // tied with talkedAbout on one reaction/comment, but posted earlier
      talkedAbout.id,
      quiet.id,
    ]);
    expect(slide(wrapped, "outro")).toEqual({ type: "outro", photos: 4, reactions: 3, comments: 1, people: 4 });
  });

  it("leaves out the slides there's nothing to show on", async () => {
    const { owner, group } = await groupWith(app, "alice");
    await photoAt(owner.agent, group.id, "2025-05-01T10:00:00Z");

    const { wrapped } = (await wrappedOf(owner.agent, group.id, 2025)).body;
    expect(types(wrapped)).toEqual(["intro", "photos", "topPhotographer", "busiestMonth", "outro"]);
    expect(slide(wrapped, "topPhotographer").runnersUp).toEqual([]);
  });

  it("saves a finished year when it's first opened, then tells the same story", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const first = await photoAt(alice.agent, group.id, "2025-03-01T10:00:00Z");
    const second = await photoAt(bob.agent, group.id, "2025-04-01T10:00:00Z");
    await reactAt(bob.agent, bob.user.id, first.id, "HEART", "2025-03-02T10:00:00Z");

    const saved = (await wrappedOf(alice.agent, group.id, 2025)).body.wrapped as Wrapped;
    expect(await prisma.wrapped.count()).toBe(1);

    // A reaction that would count for 2025 if the year were counted again.
    await reactAt(alice.agent, alice.user.id, second.id, "FIRE", "2025-12-30T10:00:00Z");
    // The zone's name in any spelling finds the same saved Wrapped.
    const again = (await wrappedOf(bob.agent, group.id, 2025, "europe/bratislava")).body.wrapped as Wrapped;
    expect(again.generatedAt).toBe(saved.generatedAt);
    expect(slide(again, "reactions").total).toBe(1);
    expect(slide(again, "outro")).toMatchObject({ photos: 2, reactions: 1 });
    expect(await prisma.wrapped.count()).toBe(1);

    // A photo deleted since drops out of the story; the numbers stay as they were.
    expect((await alice.agent.delete(`/api/photos/${first.id}`)).status).toBe(204);
    const later = (await wrappedOf(alice.agent, group.id, 2025)).body.wrapped as Wrapped;
    expect(types(later)).toEqual(["intro", "photos", "topPhotographer", "busiestMonth", "reactions", "outro"]);
    expect(slide(later, "photos").total).toBe(2);

    // Someone in another time zone gets their own year.
    expect((await wrappedOf(alice.agent, group.id, 2025, "UTC")).status).toBe(200);
    expect(await prisma.wrapped.count()).toBe(2);
  });

  it("counts a saved Wrapped again if it was saved in an older format", async () => {
    const { owner, group } = await groupWith(app, "alice");
    await photoAt(owner.agent, group.id, "2025-05-01T10:00:00Z");
    expect((await wrappedOf(owner.agent, group.id, 2025)).status).toBe(200);

    await prisma.wrapped.updateMany({ data: { stats: { version: 0 } } });
    const { wrapped } = (await wrappedOf(owner.agent, group.id, 2025)).body;
    expect(slide(wrapped, "photos").total).toBe(1);
    expect((await prisma.wrapped.findFirstOrThrow()).stats).toMatchObject({ version: 2, photos: { total: 1 } });
  });

  it("leaves a Wrapped saved by a newer server alone", async () => {
    const { owner, group } = await groupWith(app, "alice");
    await photoAt(owner.agent, group.id, "2025-05-01T10:00:00Z");
    expect((await wrappedOf(owner.agent, group.id, 2025)).status).toBe(200);

    await prisma.wrapped.updateMany({ data: { stats: { version: 99 } } });
    const { wrapped } = (await wrappedOf(owner.agent, group.id, 2025)).body;
    expect(slide(wrapped, "photos").total).toBe(1);
    expect((await prisma.wrapped.findFirstOrThrow()).stats).toEqual({ version: 99 });
  });

  it("keeps the first save when friends open a finished year at the same moment", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    await photoAt(owner.agent, group.id, "2025-05-01T10:00:00Z");

    const opened = await Promise.all([owner.agent, members[0]!.agent, owner.agent].map((agent) => wrappedOf(agent, group.id, 2025)));
    expect(opened.map((res) => res.status)).toEqual([200, 200, 200]);
    expect(await prisma.wrapped.count()).toBe(1);

    const saved = await prisma.wrapped.findFirstOrThrow();
    const later = (await wrappedOf(owner.agent, group.id, 2025)).body.wrapped as Wrapped;
    expect(later.generatedAt).toBe(saved.generatedAt.toISOString());
  });

  it("counts the year in progress live, without saving it", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const year = thisYear(BRATISLAVA);

    await uploadPhoto(owner.agent, group.id);
    let { wrapped } = (await wrappedOf(owner.agent, group.id, year)).body;
    expect(wrapped.final).toBe(false);
    expect(slide(wrapped, "photos").total).toBe(1);

    await uploadPhoto(owner.agent, group.id);
    ({ wrapped } = (await wrappedOf(owner.agent, group.id, year)).body);
    expect(slide(wrapped, "photos").total).toBe(2);
    expect(await prisma.wrapped.count()).toBe(0);
  });

  it("doesn't exist for a year without photos, and is for members only", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const carol = await signUp(app, "carol");
    await photoAt(owner.agent, group.id, "2025-05-01T10:00:00Z");

    expect((await wrappedOf(owner.agent, group.id, 2024)).status).toBe(404);
    expect((await wrappedOf(owner.agent, group.id, 2099)).status).toBe(404);
    expect(await prisma.wrapped.count()).toBe(0);

    expect((await wrappedOf(carol.agent, group.id, 2025)).status).toBe(404);
    expect((await request(app).get(`/api/groups/${group.id}/wrapped/2025?tz=UTC`)).status).toBe(401);
    expect((await wrappedOf(owner.agent, group.id, 1999)).status).toBe(400);
    expect((await wrappedOf(owner.agent, group.id, 2025, "Mars/Olympus")).status).toBe(400);
    expect((await owner.agent.get(`/api/groups/${group.id}/wrapped/2025`)).status).toBe(400);
  });
});

describe("your Wrapped list", () => {
  it("has one for each of your groups and each year with photos, in your time zone", async () => {
    const { owner: alice, members, group: boys } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const uni = await createGroup(alice.agent, { name: "Uni", emoji: "🎓" });

    await photoAt(alice.agent, boys.id, "2021-06-01T10:00:00Z");
    // New Year's Eve in UTC, but already 2024 in Bratislava.
    await photoAt(bob.agent, boys.id, "2023-12-31T23:30:00Z");
    await photoAt(alice.agent, uni.id, "2021-09-01T10:00:00Z");
    await photoAt(alice.agent, uni.id, "2025-05-01T10:00:00Z"); // nothing in 2022–2024

    const entry = (group: { id: string }, name: string, year: number) => ({
      group: { id: group.id, name, emoji: name === "Uni" ? "🎓" : "🍻" },
      year,
      final: true,
    });

    const inBratislava = await listWrapped(alice.agent);
    expect(inBratislava.status).toBe(200);
    expect(inBratislava.body.wrapped).toEqual([
      entry(uni, "Uni", 2025),
      entry(boys, "The Boys", 2024),
      entry(boys, "The Boys", 2021),
      entry(uni, "Uni", 2021),
    ]);
    expect((await listWrapped(alice.agent, "UTC")).body.wrapped).toEqual([
      entry(uni, "Uni", 2025),
      entry(boys, "The Boys", 2023),
      entry(boys, "The Boys", 2021),
      entry(uni, "Uni", 2021),
    ]);

    // Bob only sees his group's; once he's left, none.
    expect((await listWrapped(bob.agent)).body.wrapped).toEqual([
      entry(boys, "The Boys", 2024),
      entry(boys, "The Boys", 2021),
    ]);
    expect((await bob.agent.post(`/api/groups/${boys.id}/leave`)).status).toBe(200);
    expect((await listWrapped(bob.agent)).body.wrapped).toEqual([]);
  });

  it("marks this year's Wrapped as still in progress", async () => {
    const { owner, group } = await groupWith(app, "alice");
    await uploadPhoto(owner.agent, group.id);

    expect((await listWrapped(owner.agent)).body.wrapped).toEqual([
      { group: { id: group.id, name: "The Boys", emoji: "🍻" }, year: thisYear(BRATISLAVA), final: false },
    ]);
  });

  it("is empty without groups or photos, and needs a time zone", async () => {
    const { owner: alice, group } = await groupWith(app, "alice");
    const carol = await signUp(app, "carol");
    expect((await listWrapped(alice.agent)).body.wrapped).toEqual([]);
    expect((await listWrapped(carol.agent)).body.wrapped).toEqual([]);

    // Joining a group with photos brings its Wrapped along.
    await uploadPhoto(alice.agent, group.id);
    const token = await createInvite(alice.agent, group.id);
    expect((await carol.agent.post(`/api/invites/${token}/accept`)).status).toBe(200);
    expect((await listWrapped(carol.agent)).body.wrapped).toHaveLength(1);

    expect((await alice.agent.get("/api/wrapped")).status).toBe(400);
    expect((await request(app).get("/api/wrapped?tz=UTC")).status).toBe(401);
  });
});

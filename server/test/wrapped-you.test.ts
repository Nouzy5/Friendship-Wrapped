import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { commentAt, groupWith, photoAt, reactAt, resetDatabase, resetStorage, type Agent } from "./helpers.js";

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

const TZ = "Europe/Bratislava";

type You = {
  type: "you";
  photos: number;
  reactionsGiven: number;
  commentsWritten: number;
  reactionsReceived: number;
  commentsReceived: number;
  busiestMonth: { month: number; count: number } | null;
  bestPhoto: { photo: { id: string }; count: number } | null;
};
type Slide = { type: string };

async function slidesOf(agent: Agent, groupId: string, year = 2025): Promise<Slide[]> {
  const res = await agent.get(`/api/groups/${groupId}/wrapped/${year}?tz=${encodeURIComponent(TZ)}`);
  expect(res.status).toBe(200);
  return res.body.wrapped.slides;
}

async function youOf(agent: Agent, groupId: string, year = 2025): Promise<You | undefined> {
  return (await slidesOf(agent, groupId, year)).find((slide): slide is You => slide.type === "you");
}

/** alice, bob, carol, dave and eve; only eve does nothing. */
async function aYear() {
  const { owner: alice, members, group } = await groupWith(app, "alice", "bob", "carol", "dave", "eve");
  const [bob, carol, dave, eve] = members as [(typeof members)[0], (typeof members)[0], (typeof members)[0], (typeof members)[0]];

  const a1 = await photoAt(alice.agent, group.id, "2025-01-05T10:00:00Z");
  const a2 = await photoAt(alice.agent, group.id, "2025-01-20T10:00:00Z");
  const a3 = await photoAt(alice.agent, group.id, "2025-08-01T10:00:00Z");
  const b1 = await photoAt(bob.agent, group.id, "2025-08-02T10:00:00Z");

  await reactAt(bob.agent, bob.user.id, a1.id, "HEART", "2025-01-06T10:00:00Z");
  await reactAt(bob.agent, bob.user.id, a2.id, "LAUGH", "2025-01-21T10:00:00Z");
  await reactAt(carol.agent, carol.user.id, a1.id, "FIRE", "2025-01-07T10:00:00Z");
  await reactAt(dave.agent, dave.user.id, a1.id, "HEART", "2025-01-08T10:00:00Z");
  await reactAt(alice.agent, alice.user.id, b1.id, "HEART", "2025-08-03T10:00:00Z");
  await reactAt(carol.agent, carol.user.id, b1.id, "FIRE", "2025-08-04T10:00:00Z");
  await commentAt(carol.agent, a3.id, "2025-08-05T10:00:00Z");
  await commentAt(bob.agent, a3.id, "2025-08-06T10:00:00Z");
  await commentAt(alice.agent, b1.id, "2025-08-07T10:00:00Z");

  return { alice, bob, carol, dave, eve, group, photos: { a1, a2, a3, b1 } };
}

describe("a personal card in Wrapped", () => {
  it("tells each person their own year in the group", async () => {
    const { alice, bob, carol, dave, group, photos } = await aYear();

    expect(await youOf(alice.agent, group.id)).toEqual({
      type: "you",
      photos: 3,
      reactionsGiven: 1,
      commentsWritten: 1,
      reactionsReceived: 4, // a1 three times, a2 once
      commentsReceived: 2,
      busiestMonth: { month: 1, count: 2 },
      bestPhoto: { photo: expect.objectContaining({ id: photos.a1.id }), count: 3 },
    });
    expect(await youOf(bob.agent, group.id)).toEqual({
      type: "you",
      photos: 1,
      reactionsGiven: 2,
      commentsWritten: 1,
      reactionsReceived: 2,
      commentsReceived: 1,
      busiestMonth: { month: 8, count: 1 },
      bestPhoto: { photo: expect.objectContaining({ id: photos.b1.id }), count: 2 },
    });
  });

  it("is there for someone who only reacted, with nothing to say about photos they didn't take", async () => {
    const { carol, dave, group } = await aYear();

    expect(await youOf(carol.agent, group.id)).toEqual({
      type: "you",
      photos: 0,
      reactionsGiven: 2,
      commentsWritten: 1,
      reactionsReceived: 0,
      commentsReceived: 0,
      busiestMonth: null,
      bestPhoto: null,
    });
    expect(await youOf(dave.agent, group.id)).toMatchObject({ photos: 0, reactionsGiven: 1, commentsWritten: 0 });
  });

  it("is left out for someone who did nothing that year, and sits just before the outro", async () => {
    const { alice, eve, group } = await aYear();

    expect((await slidesOf(eve.agent, group.id)).map((slide) => slide.type)).not.toContain("you");
    const types = (await slidesOf(alice.agent, group.id)).map((slide) => slide.type);
    expect(types.slice(-2)).toEqual(["you", "outro"]);
  });

  it("has only the person's own numbers", async () => {
    const { alice, group } = await aYear();

    const you = (await youOf(alice.agent, group.id))!;
    expect(Object.keys(you).toSorted()).toEqual([
      "bestPhoto",
      "busiestMonth",
      "commentsReceived",
      "commentsWritten",
      "photos",
      "reactionsGiven",
      "reactionsReceived",
      "type",
    ]);
  });

  it("counts what a photo of the year received whenever it came, but reactions given only in the year", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const late = await photoAt(alice.agent, group.id, "2025-12-30T10:00:00Z");
    await reactAt(bob.agent, bob.user.id, late.id, "HEART", "2026-02-01T10:00:00Z");
    await commentAt(bob.agent, late.id, "2026-02-02T10:00:00Z");

    expect(await youOf(alice.agent, group.id)).toMatchObject({ reactionsReceived: 1, commentsReceived: 1 });
    // Bob did it in 2026, so there's nothing of his in 2025.
    expect(await youOf(bob.agent, group.id)).toBeUndefined();
  });

  it("picks the earlier month and the earlier photo on a tie, and has no best photo without a reaction", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const march = await photoAt(alice.agent, group.id, "2025-03-10T10:00:00Z");
    const june = await photoAt(alice.agent, group.id, "2025-06-10T10:00:00Z");
    await photoAt(alice.agent, group.id, "2025-09-10T10:00:00Z");

    let you = (await youOf(alice.agent, group.id))!;
    expect(you.busiestMonth).toEqual({ month: 3, count: 1 });
    expect(you.bestPhoto).toBeNull();

    // Opening a finished year saves it, so count it afresh once there are reactions.
    await prisma.wrapped.deleteMany();
    await reactAt(bob.agent, bob.user.id, june.id, "HEART", "2025-06-11T10:00:00Z");
    await reactAt(bob.agent, bob.user.id, march.id, "HEART", "2025-03-11T10:00:00Z");
    you = (await youOf(alice.agent, group.id))!;
    expect(you.bestPhoto).toEqual({ photo: expect.objectContaining({ id: march.id }), count: 1 });
  });

  it("is still the person's own when they chose not to appear in Wrapped", async () => {
    const { alice, bob, group } = await aYear();
    expect((await alice.agent.patch("/api/users/me/settings").send({ showInWrapped: false })).status).toBe(200);

    // Alice still sees her own year…
    expect(await youOf(alice.agent, group.id)).toMatchObject({ photos: 3, reactionsReceived: 4 });
    // …but Bob's story leaves her off its person lists, while her photos still count in the totals.
    const slides = await slidesOf(bob.agent, group.id);
    const photos = slides.find((slide) => slide.type === "photos") as unknown as { total: number; byUser: { user: { username: string } }[] };
    expect(photos.total).toBe(4);
    expect(photos.byUser.map(({ user }) => user.username)).toEqual(["bob"]);
  });

  it("is in the group's stats as the viewer's own", async () => {
    const { alice, bob, group } = await aYear();

    const stats = (viewer: Agent) => viewer.get(`/api/groups/${group.id}/stats/2025?tz=${encodeURIComponent(TZ)}`);
    expect((await stats(alice.agent)).body.stats.you).toMatchObject({ photos: 3 });
    expect((await stats(bob.agent)).body.stats.you).toMatchObject({ photos: 1 });
  });

  it("has no best photo when it was deleted after the year was saved", async () => {
    const { alice, group, photos } = await aYear();
    expect(await youOf(alice.agent, group.id)).toMatchObject({ bestPhoto: { count: 3 } }); // saved now
    expect((await alice.agent.delete(`/api/photos/${photos.a1.id}`)).status).toBe(204);

    // The saved numbers say a1 was the best but it's gone, and only each person's single best is saved:
    // no best photo, rather than a broken one. The other numbers stay as they were.
    expect(await youOf(alice.agent, group.id)).toMatchObject({ bestPhoto: null, photos: 3, reactionsReceived: 4 });
  });
});

describe("the Wrapped format with a personal card", () => {
  it("is saved as version 4 with each person's numbers", async () => {
    const { alice, group } = await aYear();
    await slidesOf(alice.agent, group.id);

    const saved = (await prisma.wrapped.findFirstOrThrow()).stats as {
      version: number;
      photos: { busiestMonthByUser: { userId: string; month: number; count: number }[] };
      reactions: { receivedByUser: { userId: string; count: number }[] };
      comments: { receivedByUser: { userId: string; count: number }[] };
    };
    expect(saved.version).toBe(4);
    expect(saved.photos.busiestMonthByUser).toEqual(
      expect.arrayContaining([
        { userId: alice.user.id, month: 1, count: 2 },
      ]),
    );
    expect(saved.reactions.receivedByUser[0]).toEqual({ userId: alice.user.id, count: 4 });
    expect(saved.comments.receivedByUser[0]).toEqual({ userId: alice.user.id, count: 2 });
  });

  it("counts a year saved before it again, so its numbers can change slightly", async () => {
    const { alice, group, photos } = await aYear();
    const before = await slidesOf(alice.agent, group.id);
    expect((before.find((slide) => slide.type === "photos") as unknown as { total: number }).total).toBe(4);

    // The same year saved in the previous format…
    const saved = (await prisma.wrapped.findFirstOrThrow()).stats as Record<string, unknown>;
    await prisma.wrapped.updateMany({ data: { stats: { ...saved, version: 3 } } });
    // …and a photo deleted since.
    expect((await alice.agent.delete(`/api/photos/${photos.a3.id}`)).status).toBe(204);

    const after = await slidesOf(alice.agent, group.id);
    expect((after.find((slide) => slide.type === "photos") as unknown as { total: number }).total).toBe(3);
    expect((await prisma.wrapped.findFirstOrThrow()).stats).toMatchObject({ version: 4, photos: { total: 3 } });
  });

  it("leaves a year already saved as version 4 exactly as it was", async () => {
    const { alice, group, photos } = await aYear();
    await slidesOf(alice.agent, group.id);
    expect((await alice.agent.delete(`/api/photos/${photos.a3.id}`)).status).toBe(204);

    const again = await slidesOf(alice.agent, group.id);
    expect((again.find((slide) => slide.type === "photos") as unknown as { total: number }).total).toBe(4);
  });
});

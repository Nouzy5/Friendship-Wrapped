import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { groupWith, resetDatabase, resetStorage, signUp, uploadPhoto, type Agent, type PhotoBody } from "./helpers.js";

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

const ids = (photos: PhotoBody[]) => photos.map((photo) => photo.id);

async function feed(agent: Agent, groupId: string, query = "") {
  const res = await agent.get(`/api/groups/${groupId}/photos${query}`);
  expect(res.status).toBe(200);
  return res.body.photos as (PhotoBody & { canSave: boolean; reactions: { reactors: unknown[] } })[];
}

const block = (agent: Agent, userId: string) => agent.put(`/api/users/me/blocks/${userId}`);

/** Alice, Bob and Carol, each with a photo; Bob and Carol react to and comment on Alice's. */
async function scene() {
  const { owner: alice, members, group } = await groupWith(app, "alice", "bob", "carol");
  const [bob, carol] = members as [(typeof members)[0], (typeof members)[0]];
  const bobs = await uploadPhoto(bob.agent, group.id);
  const carols = await uploadPhoto(carol.agent, group.id);
  const alices = await uploadPhoto(alice.agent, group.id);
  for (const [agent, type] of [
    [carol.agent, "HEART"],
    [bob.agent, "LAUGH"],
  ] as const) {
    expect((await agent.put(`/api/photos/${alices.id}/reaction`).send({ type })).status).toBe(200);
    expect((await agent.post(`/api/photos/${alices.id}/comments`).send({ body: `from ${type}` })).status).toBe(201);
  }
  return { alice, bob, carol, group, bobs, carols, alices };
}

describe("blocking", () => {
  it("is listed, can't target yourself or nobody, and is undone by unblocking", async () => {
    const { alice, bob } = await scene();

    expect((await block(alice.agent, alice.user.id)).status).toBe(400);
    expect((await block(alice.agent, "0190d5c8-0000-7000-8000-000000000000")).status).toBe(404);
    expect((await block(alice.agent, "nope")).status).toBe(400);

    expect((await block(alice.agent, bob.user.id)).status).toBe(204);
    expect((await block(alice.agent, bob.user.id)).status).toBe(204); // again: a no-op
    const list = await alice.agent.get("/api/users/me/blocks");
    expect(list.body).toEqual({
      blocked: [{ id: bob.user.id, username: "bob", displayName: "Bob", avatarUrl: null }],
    });
    expect((await bob.agent.get("/api/users/me/blocks")).body.blocked).toEqual([]);

    expect((await alice.agent.delete(`/api/users/me/blocks/${bob.user.id}`)).status).toBe(204);
    expect((await alice.agent.get("/api/users/me/blocks")).body.blocked).toEqual([]);
    expect((await request(app).get("/api/users/me/blocks")).status).toBe(401);
  });

  it("hides each person's photos, reactions and comments from the other, both ways", async () => {
    const { alice, bob, carol, group, bobs, carols, alices } = await scene();
    expect((await alice.agent.put(`/api/photos/${bobs.id}/favorite`)).status).toBe(200);
    const album = (await alice.agent.post(`/api/groups/${group.id}/albums`).send({ name: "All" })).body.album;
    await alice.agent.post(`/api/albums/${album.id}/photos`).send({ photoIds: [carols.id, bobs.id] });

    expect((await block(alice.agent, bob.user.id)).status).toBe(204);

    // Feeds, favorites, albums and the photo itself.
    expect(ids(await feed(alice.agent, group.id))).toEqual([alices.id, carols.id]);
    expect(ids(await feed(bob.agent, group.id))).toEqual([carols.id, bobs.id]);
    expect(ids(await feed(carol.agent, group.id))).toEqual([alices.id, carols.id, bobs.id]);
    expect(await feed(alice.agent, group.id, "?favorites=true")).toEqual([]);
    expect(ids((await alice.agent.get(`/api/albums/${album.id}/photos`)).body.photos)).toEqual([carols.id]);
    expect((await alice.agent.get(`/api/albums/${album.id}`)).body.album).toMatchObject({
      photoCount: 1,
      cover: { photoId: carols.id },
    });
    expect((await alice.agent.get(`/api/photos/${bobs.id}`)).status).toBe(404);
    expect((await alice.agent.get(`/api/photos/${bobs.id}/images/thumbnail`)).status).toBe(404);
    expect((await bob.agent.get(`/api/photos/${alices.id}`)).status).toBe(404);
    expect((await bob.agent.put(`/api/photos/${alices.id}/reaction`).send({ type: "FIRE" })).status).toBe(404);

    // Bob's reaction and comment on Alice's photo are gone for her, but not for Carol.
    const mine = (await alice.agent.get(`/api/photos/${alices.id}`)).body.photo;
    expect(mine.reactions).toMatchObject({ total: 1, counts: { HEART: 1, LAUGH: 0 } });
    expect(mine.reactions.reactors).toEqual([{ userId: carol.user.id, type: "HEART" }]);
    expect(mine.commentCount).toBe(1);
    const reactions = (await alice.agent.get(`/api/photos/${alices.id}/reactions`)).body.reactions;
    expect(reactions.map((r: { user: { username: string } }) => r.user.username)).toEqual(["carol"]);
    const comments = (await alice.agent.get(`/api/photos/${alices.id}/comments`)).body.comments;
    expect(comments.map((c: { body: string }) => c.body)).toEqual(["from HEART"]);

    const carolsView = (await carol.agent.get(`/api/photos/${alices.id}`)).body.photo;
    expect(carolsView.reactions.reactors).toEqual([
      { userId: carol.user.id, type: "HEART" },
      { userId: bob.user.id, type: "LAUGH" },
    ]);
    expect(carolsView.commentCount).toBe(2);

    // Unblocking brings everything back.
    await alice.agent.delete(`/api/users/me/blocks/${bob.user.id}`);
    expect(ids(await feed(alice.agent, group.id))).toEqual([alices.id, carols.id, bobs.id]);
    expect((await alice.agent.get(`/api/photos/${alices.id}`)).body.photo.reactions.total).toBe(2);
  });

  it("swipes past blocked photos in the viewer", async () => {
    const { alice, bob, alices, carols } = await scene();
    await block(bob.agent, alice.user.id); // Bob blocked Alice: it works for her too
    const feedOf = (await alice.agent.get(`/api/photos/${carols.id}`)).body.photo.feed;
    expect(feedOf).toEqual({ newerId: alices.id, olderId: null });
  });
});

describe("photos you can save", () => {
  it("follows the uploader's setting, and only allowed viewers can download", async () => {
    const { alice, bob, group, bobs, carols } = await scene();
    expect((await bob.agent.patch("/api/users/me/settings").send({ allowPhotoSaving: false })).status).toBe(200);

    const seen = Object.fromEntries((await feed(alice.agent, group.id)).map((p) => [p.id, p.canSave]));
    expect(seen).toMatchObject({ [bobs.id]: false, [carols.id]: true });
    expect((await bob.agent.get(`/api/photos/${bobs.id}`)).body.photo.canSave).toBe(true);

    expect((await alice.agent.get(`/api/photos/${bobs.id}/images/full?download=1`)).status).toBe(403);
    // Looking is still fine.
    expect((await alice.agent.get(`/api/photos/${bobs.id}/images/full`)).status).toBe(200);

    const own = await bob.agent.get(`/api/photos/${bobs.id}/images/full?download=1`).buffer(true);
    expect(own.status).toBe(200);
    expect(own.headers["content-type"]).toBe("image/webp");
    const date = new Date().toISOString().slice(0, 10);
    expect(own.headers["content-disposition"]).toBe(`attachment; filename="friendship-wrapped-${date}.webp"`);

    const allowed = await alice.agent.get(`/api/photos/${carols.id}/images/full?download=1`);
    expect(allowed.status).toBe(200);
    expect(allowed.headers["content-disposition"]).toMatch(/^attachment;/);
  });
});

describe("taken by", () => {
  it("filters a group's photos by who posted them", async () => {
    const { bob, carol, group, bobs } = await scene();
    expect(ids(await feed(carol.agent, group.id, `?uploaderId=${bob.user.id}`))).toEqual([bobs.id]);
    expect((await carol.agent.get(`/api/groups/${group.id}/photos?uploaderId=bob`)).status).toBe(400);
  });
});

describe("reports", () => {
  it("are stored, about a photo you can see or a person", async () => {
    const { alice, bob, bobs } = await scene();
    const outsider = await signUp(app, "mallory");

    const res = await alice.agent.post("/api/reports").send({ photoId: bobs.id, userId: bob.user.id, message: "  Not ok  " });
    expect(res.status).toBe(201);
    expect(res.body.report).toEqual({ id: expect.any(String), createdAt: expect.any(String) });
    expect(await prisma.report.findFirstOrThrow()).toMatchObject({
      reporterId: alice.user.id,
      photoId: bobs.id,
      reportedUserId: bob.user.id,
      message: "Not ok",
    });

    expect((await outsider.agent.post("/api/reports").send({ userId: bob.user.id, message: "spam" })).status).toBe(201);
    expect((await outsider.agent.post("/api/reports").send({ photoId: bobs.id, message: "x" })).status).toBe(404);
    expect(
      (await alice.agent.post("/api/reports").send({ userId: "0190d5c8-0000-7000-8000-000000000000", message: "x" }))
        .status,
    ).toBe(404);
    expect((await alice.agent.post("/api/reports").send({ userId: bob.user.id, message: " " })).status).toBe(400);
    expect((await alice.agent.post("/api/reports").send({ userId: bob.user.id, message: "x".repeat(1001) })).status).toBe(
      400,
    );
    expect((await request(app).post("/api/reports").send({ message: "hi" })).status).toBe(401);
    expect(await prisma.report.count()).toBe(2);
  });
});

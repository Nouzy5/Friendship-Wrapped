import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  createGroup,
  groupWith,
  resetDatabase,
  resetStorage,
  signUp,
  uploadPhoto,
  type Agent,
  type PhotoBody,
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

const noReactions = { HEART: 0, LAUGH: 0, SKULL: 0, FIRE: 0, CRY: 0 };

async function photoAs(agent: Agent, photoId: string): Promise<PhotoBody> {
  const res = await agent.get(`/api/photos/${photoId}`);
  expect(res.status).toBe(200);
  return res.body.photo;
}

function react(agent: Agent, photoId: string, type: string) {
  return agent.put(`/api/photos/${photoId}/reaction`).send({ type });
}

function comment(agent: Agent, photoId: string, body: string) {
  return agent.post(`/api/photos/${photoId}/comments`).send({ body });
}

describe("definition of done: a member reacts to and comments on a friend's photo", () => {
  it("shows the reaction and comment to everyone in the group", async () => {
    const { owner: nicolas, members, group } = await groupWith(app, "nicolas", "bob");
    const bob = members[0]!;
    const photo = await uploadPhoto(nicolas.agent, group.id, undefined, "Sunset at the lake 🌅");
    expect(photo).toMatchObject({
      canInteract: true,
      reactions: { counts: noReactions, total: 0, mine: null },
      commentCount: 0,
      isFavorite: false,
    });

    expect((await react(bob.agent, photo.id, "HEART")).status).toBe(200);
    const posted = await comment(bob.agent, photo.id, "Unreal colours!");
    expect(posted.status).toBe(201);

    const feed = await nicolas.agent.get(`/api/groups/${group.id}/photos`);
    expect(feed.body.photos[0]).toMatchObject({
      reactions: { counts: { ...noReactions, HEART: 1 }, total: 1, mine: null },
      commentCount: 1,
    });
    expect((await photoAs(bob.agent, photo.id)).reactions.mine).toBe("HEART");

    const comments = await nicolas.agent.get(`/api/photos/${photo.id}/comments`);
    expect(comments.body).toEqual({
      comments: [
        {
          id: posted.body.comment.id,
          photoId: photo.id,
          body: "Unreal colours!",
          createdAt: expect.any(String),
          author: expect.objectContaining({ id: bob.user.id, displayName: "Bob" }),
          canDelete: false,
        },
      ],
      nextCursor: null,
    });
  });
});

describe("reactions", () => {
  it("adds, changes and removes your one reaction per photo", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob", "carol");
    const [bob, carol] = members as [(typeof members)[0], (typeof members)[0]];
    const photo = await uploadPhoto(alice.agent, group.id);

    const added = await react(bob.agent, photo.id, "LAUGH");
    expect(added.body.summary).toEqual({ counts: { ...noReactions, LAUGH: 1 }, total: 1, mine: "LAUGH" });

    await react(carol.agent, photo.id, "LAUGH");
    const changed = await react(bob.agent, photo.id, "SKULL");
    expect(changed.body.summary).toEqual({
      counts: { ...noReactions, LAUGH: 1, SKULL: 1 },
      total: 2,
      mine: "SKULL",
    });
    expect(await prisma.reaction.count()).toBe(2);

    const removed = await bob.agent.delete(`/api/photos/${photo.id}/reaction`);
    expect(removed.status).toBe(200);
    expect(removed.body.summary).toEqual({ counts: { ...noReactions, LAUGH: 1 }, total: 1, mine: null });

    // Removing again is harmless.
    expect((await bob.agent.delete(`/api/photos/${photo.id}/reaction`)).status).toBe(200);
  });

  it("keeps when you first reacted, for Wrapped", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const photo = await uploadPhoto(owner.agent, group.id);

    await react(owner.agent, photo.id, "FIRE");
    const first = await prisma.reaction.findFirstOrThrow();
    await react(owner.agent, photo.id, "CRY");
    const changed = await prisma.reaction.findFirstOrThrow();

    expect(changed.type).toBe("CRY");
    expect(changed.createdAt).toEqual(first.createdAt);
    expect(changed.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
  });

  it("lists who reacted, and how", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const photo = await uploadPhoto(alice.agent, group.id);
    await react(bob.agent, photo.id, "HEART");
    await react(alice.agent, photo.id, "FIRE");
    // Make the order unambiguous even if both landed in the same millisecond.
    await prisma.reaction.update({
      where: { photoId_userId: { photoId: photo.id, userId: bob.user.id } },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });

    const res = await alice.agent.get(`/api/photos/${photo.id}/reactions`);
    expect(res.status).toBe(200);
    expect(res.body.reactions).toEqual([
      { user: expect.objectContaining({ id: bob.user.id }), type: "HEART", createdAt: expect.any(String) },
      { user: expect.objectContaining({ id: alice.user.id }), type: "FIRE", createdAt: expect.any(String) },
    ]);
  });

  it("only accepts the five reactions", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const photo = await uploadPhoto(owner.agent, group.id);

    for (const type of ["THUMBS_UP", "heart", "❤️", ""]) {
      expect((await react(owner.agent, photo.id, type)).status).toBe(400);
    }
    expect((await owner.agent.put(`/api/photos/${photo.id}/reaction`).send({})).status).toBe(400);
  });

  it("are counted per photo in the feed, with only your own marked as yours", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const quiet = await uploadPhoto(alice.agent, group.id);
    const popular = await uploadPhoto(alice.agent, group.id);
    await react(alice.agent, popular.id, "HEART");
    await react(bob.agent, popular.id, "HEART");

    const feed = (await bob.agent.get(`/api/groups/${group.id}/photos`)).body.photos as PhotoBody[];
    expect(feed.map((photo) => [photo.id, photo.reactions.total, photo.reactions.mine])).toEqual([
      [popular.id, 2, "HEART"],
      [quiet.id, 0, null],
    ]);
  });
});

describe("comments", () => {
  it("lists oldest first, a page at a time", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const photo = await uploadPhoto(owner.agent, group.id);
    for (const body of ["one", "two", "three"]) await comment(owner.agent, photo.id, body);

    const page1 = await owner.agent.get(`/api/photos/${photo.id}/comments?limit=2`);
    expect(page1.body.comments.map((c: { body: string }) => c.body)).toEqual(["one", "two"]);
    expect(page1.body.nextCursor).toEqual(expect.any(String));

    const page2 = await owner.agent.get(`/api/photos/${photo.id}/comments?limit=2&cursor=${page1.body.nextCursor}`);
    expect(page2.body.comments.map((c: { body: string }) => c.body)).toEqual(["three"]);
    expect(page2.body.nextCursor).toBeNull();

    expect((await photoAs(owner.agent, photo.id)).commentCount).toBe(3);
  });

  it("validates the text", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const photo = await uploadPhoto(owner.agent, group.id);

    const blank = await comment(owner.agent, photo.id, "   \n ");
    expect(blank.status).toBe(400);
    expect(blank.body.error.details).toEqual([{ path: "body", message: "Write a comment first" }]);

    const tooLong = await comment(owner.agent, photo.id, "x".repeat(501));
    expect(tooLong.body.error.details).toEqual([
      { path: "body", message: "Comments can be at most 500 characters" },
    ]);
    expect((await comment(owner.agent, photo.id, "bell\u0007")).status).toBe(400);

    const multiline = await comment(owner.agent, photo.id, "  first line\r\nsecond line  ");
    expect(multiline.status).toBe(201);
    expect(multiline.body.comment.body).toBe("first line\nsecond line");
  });

  it("lets only the author delete a comment", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const photo = await uploadPhoto(alice.agent, group.id);
    const bobs = (await comment(bob.agent, photo.id, "Nice")).body.comment;
    expect(bobs.canDelete).toBe(true);

    // Not even the photo's uploader or the group owner can delete someone else's comment.
    const byAlice = await alice.agent.delete(`/api/comments/${bobs.id}`);
    expect(byAlice.status).toBe(403);

    const stranger = await signUp(app, "carol");
    expect((await stranger.agent.delete(`/api/comments/${bobs.id}`)).status).toBe(404);

    expect((await bob.agent.delete(`/api/comments/${bobs.id}`)).status).toBe(204);
    expect((await bob.agent.delete(`/api/comments/${bobs.id}`)).status).toBe(404);
    expect((await photoAs(alice.agent, photo.id)).commentCount).toBe(0);
  });
});

describe("favorites", () => {
  it("are private to the person who favorites, and idempotent", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const photo = await uploadPhoto(alice.agent, group.id);

    for (let i = 0; i < 2; i++) {
      const res = await bob.agent.put(`/api/photos/${photo.id}/favorite`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isFavorite: true });
    }
    expect((await photoAs(bob.agent, photo.id)).isFavorite).toBe(true);
    expect((await photoAs(alice.agent, photo.id)).isFavorite).toBe(false);
    expect(await prisma.favorite.count()).toBe(1);

    for (let i = 0; i < 2; i++) {
      expect((await bob.agent.delete(`/api/photos/${photo.id}/favorite`)).body).toEqual({ isFavorite: false });
    }
    expect((await photoAs(bob.agent, photo.id)).isFavorite).toBe(false);
  });
});

describe("privacy", () => {
  it("hides everything from non-members (404)", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const photo = await uploadPhoto(owner.agent, group.id);
    const ownComment = (await comment(owner.agent, photo.id, "mine")).body.comment;
    const carol = await signUp(app, "carol");

    expect((await react(carol.agent, photo.id, "HEART")).status).toBe(404);
    expect((await carol.agent.delete(`/api/photos/${photo.id}/reaction`)).status).toBe(404);
    expect((await carol.agent.get(`/api/photos/${photo.id}/reactions`)).status).toBe(404);
    expect((await comment(carol.agent, photo.id, "hi")).status).toBe(404);
    expect((await carol.agent.get(`/api/photos/${photo.id}/comments`)).status).toBe(404);
    expect((await carol.agent.delete(`/api/comments/${ownComment.id}`)).status).toBe(404);
    expect((await carol.agent.put(`/api/photos/${photo.id}/favorite`)).status).toBe(404);
    expect(await prisma.reaction.count()).toBe(0);
    expect(await prisma.favorite.count()).toBe(0);
  });

  it("requires a session", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const photo = await uploadPhoto(owner.agent, group.id);

    expect((await request(app).put(`/api/photos/${photo.id}/reaction`).send({ type: "HEART" })).status).toBe(401);
    expect((await request(app).get(`/api/photos/${photo.id}/comments`)).status).toBe(401);
    expect((await request(app).put(`/api/photos/${photo.id}/favorite`)).status).toBe(401);
  });

  it("lets someone who left see and tidy up their own activity, but not join in any more", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const photo = await uploadPhoto(bob.agent, group.id);
    await react(bob.agent, photo.id, "HEART");
    const bobsComment = (await comment(bob.agent, photo.id, "First!")).body.comment;
    await bob.agent.put(`/api/photos/${photo.id}/favorite`);

    expect((await bob.agent.post(`/api/groups/${group.id}/leave`)).status).toBe(200);

    // Their reaction and comment stay with the group's photo...
    const asAlice = await photoAs(alice.agent, photo.id);
    expect(asAlice).toMatchObject({ commentCount: 1, reactions: { total: 1 } });

    // ...they can still see their own photo, but not react or comment any more...
    const asBob = await photoAs(bob.agent, photo.id);
    expect(asBob).toMatchObject({ canInteract: false, isFavorite: true, reactions: { mine: "HEART" } });
    expect((await react(bob.agent, photo.id, "FIRE")).status).toBe(403);
    expect((await comment(bob.agent, photo.id, "Still here")).status).toBe(403);

    // ...and they can remove what they left behind.
    expect((await bob.agent.delete(`/api/photos/${photo.id}/reaction`)).status).toBe(200);
    expect((await bob.agent.delete(`/api/comments/${bobsComment.id}`)).status).toBe(204);
    expect((await bob.agent.delete(`/api/photos/${photo.id}/favorite`)).status).toBe(200);
    expect(await photoAs(alice.agent, photo.id)).toMatchObject({ commentCount: 0, reactions: { total: 0 } });
  });

  it("rejects malformed ids", async () => {
    const { owner } = await groupWith(app, "alice");
    expect((await react(owner.agent, "not-a-uuid", "HEART")).status).toBe(400);
    expect((await owner.agent.delete("/api/comments/not-a-uuid")).status).toBe(400);
    expect((await owner.agent.get(`/api/photos/${crypto.randomUUID()}/comments?cursor=nope`)).status).toBe(400);
  });
});

describe("deleting", () => {
  it("removes a photo's reactions, comments and favorites with it", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const photo = await uploadPhoto(owner.agent, group.id);
    const kept = await uploadPhoto(owner.agent, (await createGroup(owner.agent)).id);
    for (const target of [photo, kept]) {
      await react(owner.agent, target.id, "HEART");
      await comment(owner.agent, target.id, "hi");
      await owner.agent.put(`/api/photos/${target.id}/favorite`);
    }

    expect((await owner.agent.delete(`/api/photos/${photo.id}`)).status).toBe(204);

    for (const count of [prisma.reaction.count(), prisma.comment.count(), prisma.favorite.count()]) {
      expect(await count).toBe(1);
    }
  });
});

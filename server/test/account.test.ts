import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { getObject } from "../src/lib/storage.js";
import {
  createGroup,
  groupWith,
  makeImage,
  photoAt,
  resetDatabase,
  resetStorage,
  sessionSetCookie,
  signUp,
  testUser,
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

function deleteAccount(agent: Agent, password = testUser.password) {
  return agent.delete("/api/users/me").send({ password });
}

/** The stored image files of a photo. */
async function photoKeys(photoId: string) {
  const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
  return [photo.storageKey, photo.mediumKey, photo.thumbnailKey];
}

const stored = async (keys: string[]) => (await Promise.all(keys.map(getObject))).filter(Boolean).length;

describe("deleting your account", () => {
  it("deletes everything you put in, and nothing anyone else did", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob", "carol");
    const [bob, carol] = members as [(typeof members)[0], (typeof members)[0]];

    const bobsPhoto = await uploadPhoto(bob.agent, group.id);
    const alicesPhoto = await uploadPhoto(alice.agent, group.id);
    expect((await carol.agent.post(`/api/photos/${bobsPhoto.id}/comments`).send({ body: "nice" })).status).toBe(201);
    expect((await alice.agent.put(`/api/photos/${bobsPhoto.id}/reaction`).send({ type: "HEART" })).status).toBe(200);
    expect((await bob.agent.post(`/api/photos/${alicesPhoto.id}/comments`).send({ body: "🔥" })).status).toBe(201);
    expect((await carol.agent.post(`/api/photos/${alicesPhoto.id}/comments`).send({ body: "😂" })).status).toBe(201);
    expect((await bob.agent.put(`/api/photos/${alicesPhoto.id}/reaction`).send({ type: "FIRE" })).status).toBe(200);
    expect((await bob.agent.put(`/api/photos/${alicesPhoto.id}/favorite`)).status).toBe(200);
    const avatar = await bob.agent
      .put("/api/users/me/avatar")
      .attach("avatar", await makeImage({ format: "png" }), { filename: "me.png", contentType: "image/png" });
    expect(avatar.status).toBe(200);
    const album = await bob.agent.post(`/api/groups/${group.id}/albums`).send({ name: "Trip" });
    expect(album.status).toBe(201);
    expect((await bob.agent.post(`/api/albums/${album.body.album.id}/photos`).send({ photoIds: [alicesPhoto.id] })).status).toBe(200);

    const bobsFiles = await photoKeys(bobsPhoto.id);
    const { avatarKey } = await prisma.user.findUniqueOrThrow({ where: { id: bob.user.id } });
    expect(await stored([...bobsFiles, avatarKey!])).toBe(4);

    const res = await deleteAccount(bob.agent);
    expect(res.status).toBe(204);
    expect(sessionSetCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);

    // Signed out, and gone.
    expect((await bob.agent.get("/api/groups")).status).toBe(401);
    expect(await prisma.user.findUnique({ where: { id: bob.user.id } })).toBeNull();
    expect(await prisma.session.count({ where: { userId: bob.user.id } })).toBe(0);

    // Their photo (with the comment and reaction on it) and its files.
    expect((await alice.agent.get(`/api/photos/${bobsPhoto.id}`)).status).toBe(404);
    expect(await prisma.comment.count({ where: { photoId: bobsPhoto.id } })).toBe(0);
    expect(await stored([...bobsFiles, avatarKey!])).toBe(0);

    // Their comment, reaction and favorite on someone else's photo; everyone else's stay.
    const photo = (await alice.agent.get(`/api/photos/${alicesPhoto.id}`)).body.photo;
    expect(photo).toMatchObject({ commentCount: 1, reactions: { total: 0 } });
    expect(await prisma.favorite.count()).toBe(0);

    // Their album stays with the group, and the owner can still manage it.
    expect((await alice.agent.get(`/api/albums/${album.body.album.id}`)).body.album).toMatchObject({
      name: "Trip",
      canManage: true,
    });
    const membersLeft = (await alice.agent.get(`/api/groups/${group.id}/members`)).body.members;
    expect(membersLeft.map((member: { user: { username: string } }) => member.user.username)).toEqual(["alice", "carol"]);

    // The username is free again.
    await signUp(app, "bob");
  });

  it("hands over the groups you own, and deletes the ones you're the last member of", async () => {
    const { owner: alice, members, group: shared } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const solo = await createGroup(alice.agent, { name: "Just me", emoji: "🌵" });
    const soloPhoto = await uploadPhoto(alice.agent, solo.id);
    const soloFiles = await photoKeys(soloPhoto.id);

    expect((await deleteAccount(alice.agent)).status).toBe(204);

    expect((await bob.agent.get(`/api/groups/${shared.id}`)).body.group).toMatchObject({ myRole: "OWNER", memberCount: 1 });
    expect(await prisma.group.findUnique({ where: { id: solo.id } })).toBeNull();
    expect(await stored(soloFiles)).toBe(0);
  });

  it("drops saved Wrapped that include you, so the year is counted again", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    await photoAt(alice.agent, group.id, "2025-03-01T10:00:00Z");
    await photoAt(bob.agent, group.id, "2025-04-01T10:00:00Z");
    const wrappedOf = () => alice.agent.get(`/api/groups/${group.id}/wrapped/2025?tz=UTC`);

    expect((await wrappedOf()).status).toBe(200);
    expect(await prisma.wrapped.count()).toBe(1);

    expect((await deleteAccount(bob.agent)).status).toBe(204);
    expect(await prisma.wrapped.count()).toBe(0);
    const { wrapped } = (await wrappedOf()).body;
    expect(wrapped.slides.find((slide: { type: string }) => slide.type === "photos")).toMatchObject({ total: 1 });
  });

  it("needs your password", async () => {
    const alice = await signUp(app, "alice");

    const wrong = await deleteAccount(alice.agent, "not my password");
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatchObject({
      code: "INCORRECT_PASSWORD",
      details: [{ path: "password", message: expect.any(String) }],
    });
    expect((await alice.agent.delete("/api/users/me").send({})).status).toBe(400);
    expect((await request(app).delete("/api/users/me").send({ password: testUser.password })).status).toBe(401);
    expect(await prisma.user.count()).toBe(1);

    // Guessing is limited (5 tries per 15 minutes; two used above).
    for (let attempt = 0; attempt < 3; attempt++) {
      expect((await deleteAccount(alice.agent, "guess")).status).toBe(400);
    }
    expect((await deleteAccount(alice.agent)).status).toBe(429);
    expect(await prisma.user.count()).toBe(1);
  });
});

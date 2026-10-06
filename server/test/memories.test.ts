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

/** Posts a photo, then backdates it (uploads are always "now"). */
async function photoAt(agent: Agent, groupId: string, createdAt: string, caption?: string) {
  const photo = await uploadPhoto(agent, groupId, undefined, caption);
  await prisma.photo.update({ where: { id: photo.id }, data: { createdAt: new Date(createdAt) } });
  return photo;
}

const ids = (photos: PhotoBody[]) => photos.map((photo) => photo.id);

describe("timeline", () => {
  it("can start from a point in time and page back from there", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const july = await photoAt(owner.agent, group.id, "2026-07-20T12:00:00Z");
    const aug1 = await photoAt(owner.agent, group.id, "2026-08-01T09:00:00Z");
    const aug2 = await photoAt(owner.agent, group.id, "2026-08-30T09:00:00Z");
    await photoAt(owner.agent, group.id, "2026-09-02T09:00:00Z");

    // "Jump to August": everything before the start of September (in the viewer's zone).
    const before = encodeURIComponent("2026-09-01T00:00:00+02:00");
    const page1 = await owner.agent.get(`/api/groups/${group.id}/photos?before=${before}&limit=2`);
    expect(page1.status).toBe(200);
    expect(ids(page1.body.photos)).toEqual([aug2.id, aug1.id]);

    const page2 = await owner.agent.get(
      `/api/groups/${group.id}/photos?before=${before}&limit=2&cursor=${page1.body.nextCursor}`,
    );
    expect(ids(page2.body.photos)).toEqual([july.id]);
    expect(page2.body.nextCursor).toBeNull();

    expect((await owner.agent.get(`/api/groups/${group.id}/photos?before=yesterday`)).status).toBe(400);
  });
});

describe("favorites", () => {
  it("lists only the photos you favorited, newest first", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const first = await uploadPhoto(alice.agent, group.id);
    const second = await uploadPhoto(alice.agent, group.id);
    await uploadPhoto(alice.agent, group.id);
    await bob.agent.put(`/api/photos/${first.id}/favorite`);
    await bob.agent.put(`/api/photos/${second.id}/favorite`);

    const bobs = await bob.agent.get(`/api/groups/${group.id}/photos?favorites=true`);
    expect(ids(bobs.body.photos)).toEqual([second.id, first.id]);
    expect(bobs.body.photos.every((photo: PhotoBody) => photo.isFavorite)).toBe(true);

    const alices = await alice.agent.get(`/api/groups/${group.id}/photos?favorites=true`);
    expect(alices.body.photos).toEqual([]);
  });
});

describe("on this day", () => {
  async function backdatedGroup() {
    const setup = await groupWith(app, "alice", "bob");
    await prisma.group.update({ where: { id: setup.group.id }, data: { createdAt: new Date("2024-01-01T00:00:00Z") } });
    return setup;
  }

  function onThisDay(agent: Agent, groupId: string, query: string) {
    return agent.get(`/api/groups/${groupId}/photos/on-this-day?${query}`);
  }

  it("finds the same calendar day in earlier years, in the viewer's time zone", async () => {
    const { owner, members, group } = await backdatedGroup();
    const bob = members[0]!;
    const lunch2025 = await photoAt(owner.agent, group.id, "2025-10-06T10:00:00Z");
    // 00:30 on 6 October in Bratislava (UTC+2), but still 5 October in UTC.
    const justAfterMidnight = await photoAt(owner.agent, group.id, "2025-10-05T22:30:00Z");
    // 00:30 on 7 October in Bratislava, but 6 October in UTC.
    const nextDayLocally = await photoAt(owner.agent, group.id, "2025-10-06T22:30:00Z");
    const lastYearButOne = await photoAt(owner.agent, group.id, "2024-10-06T12:00:00Z");
    await photoAt(owner.agent, group.id, "2026-10-06T08:00:00Z"); // today itself isn't a memory
    await photoAt(owner.agent, group.id, "2025-09-06T08:00:00Z"); // nor is another month

    const local = await onThisDay(bob.agent, group.id, "tz=Europe/Bratislava&date=2026-10-06");
    expect(local.status).toBe(200);
    expect(local.body.date).toBe("2026-10-06");
    expect(local.body.years.map((y: { year: number; photos: PhotoBody[] }) => [y.year, ids(y.photos)])).toEqual([
      [2025, [lunch2025.id, justAfterMidnight.id]],
      [2024, [lastYearButOne.id]],
    ]);

    const utc = await onThisDay(bob.agent, group.id, "tz=UTC&date=2026-10-06");
    expect(utc.body.years.map((y: { year: number; photos: PhotoBody[] }) => [y.year, ids(y.photos)])).toEqual([
      [2025, [nextDayLocally.id, lunch2025.id]],
      [2024, [lastYearButOne.id]],
    ]);
  });

  it("only brings 29 February back in leap years", async () => {
    const { owner, group } = await backdatedGroup();
    const leapDay = await photoAt(owner.agent, group.id, "2024-02-29T12:00:00Z");

    const res = await onThisDay(owner.agent, group.id, "tz=UTC&date=2028-02-29");
    expect(res.body.years).toEqual([{ year: 2024, photos: [expect.objectContaining({ id: leapDay.id })] }]);
    expect((await onThisDay(owner.agent, group.id, "tz=UTC&date=2027-02-29")).status).toBe(400);
  });

  it("is empty for a group that's younger than a year, and defaults to today", async () => {
    const { owner, group } = await groupWith(app, "alice");
    await uploadPhoto(owner.agent, group.id);

    const res = await onThisDay(owner.agent, group.id, "tz=Europe/Bratislava");
    expect(res.status).toBe(200);
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.years).toEqual([]);
  });

  it("validates the time zone and is for members only", async () => {
    const { owner, group } = await groupWith(app, "alice");
    expect((await onThisDay(owner.agent, group.id, "tz=Mars/Olympus")).status).toBe(400);
    expect((await onThisDay(owner.agent, group.id, "")).status).toBe(400);

    const carol = await signUp(app, "carol");
    expect((await onThisDay(carol.agent, group.id, "tz=UTC")).status).toBe(404);
  });
});

describe("albums", () => {
  async function createAlbum(agent: Agent, groupId: string, name = "Summer trip") {
    const res = await agent.post(`/api/groups/${groupId}/albums`).send({ name });
    expect(res.status).toBe(201);
    return res.body.album as { id: string; photoCount: number; canManage: boolean };
  }

  function addPhotos(agent: Agent, albumId: string, photoIds: string[]) {
    return agent.post(`/api/albums/${albumId}/photos`).send({ photoIds });
  }

  it("lets members build a shared album, oldest photo first", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const album = await createAlbum(bob.agent, group.id, "  Summer trip  ");
    expect(album).toMatchObject({ name: "Summer trip", photoCount: 0, cover: null, canManage: true });

    const day1 = await photoAt(alice.agent, group.id, "2026-07-01T10:00:00Z");
    const day2 = await photoAt(bob.agent, group.id, "2026-07-02T10:00:00Z");
    expect((await addPhotos(alice.agent, album.id, [day2.id])).status).toBe(200);
    const added = await addPhotos(alice.agent, album.id, [day1.id, day2.id, day1.id]);
    expect(added.status).toBe(200);
    expect(added.body.album).toMatchObject({
      photoCount: 2,
      // The cover is the photo added last, whatever its date.
      cover: { photoId: day1.id, thumbnailUrl: `/api/photos/${day1.id}/images/thumbnail` },
      canManage: true, // Alice didn't create it, but she owns the group
    });
  });

  it("lists photos oldest first, pages, and reports which albums a photo is in", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const album = await createAlbum(owner.agent, group.id);
    const other = await createAlbum(owner.agent, group.id, "Best of");
    const photos = [];
    for (let day = 1; day <= 3; day++) photos.push(await photoAt(owner.agent, group.id, `2026-07-0${day}T10:00:00Z`));
    await addPhotos(owner.agent, album.id, ids(photos));
    await addPhotos(owner.agent, other.id, [photos[1]!.id]);

    const page1 = await owner.agent.get(`/api/albums/${album.id}/photos?limit=2`);
    expect(ids(page1.body.photos)).toEqual([photos[0]!.id, photos[1]!.id]);
    const page2 = await owner.agent.get(`/api/albums/${album.id}/photos?limit=2&cursor=${page1.body.nextCursor}`);
    expect(ids(page2.body.photos)).toEqual([photos[2]!.id]);

    const inAlbums = await owner.agent.get(`/api/photos/${photos[1]!.id}/albums`);
    expect(inAlbums.body.albumIds.toSorted()).toEqual([album.id, other.id].toSorted());

    const list = await owner.agent.get(`/api/groups/${group.id}/albums`);
    expect(list.body.albums.map((a: { name: string; photoCount: number }) => [a.name, a.photoCount])).toEqual([
      ["Best of", 1],
      ["Summer trip", 3],
    ]);
  });

  it("removes photos from an album without deleting them, and deleting a photo takes it out of albums", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const album = await createAlbum(owner.agent, group.id);
    const kept = await uploadPhoto(owner.agent, group.id);
    const removed = await uploadPhoto(owner.agent, group.id);
    const deleted = await uploadPhoto(owner.agent, group.id);
    await addPhotos(owner.agent, album.id, [kept.id, removed.id, deleted.id]);

    const res = await owner.agent.delete(`/api/albums/${album.id}/photos/${removed.id}`);
    expect(res.status).toBe(200);
    expect(res.body.album.photoCount).toBe(2);
    expect((await owner.agent.get(`/api/photos/${removed.id}`)).status).toBe(200);

    await owner.agent.delete(`/api/photos/${deleted.id}`);
    expect((await owner.agent.get(`/api/albums/${album.id}`)).body.album.photoCount).toBe(1);
  });

  it("only takes photos from the album's own group", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const album = await createAlbum(owner.agent, group.id);
    const elsewhere = await uploadPhoto(owner.agent, (await createGroup(owner.agent, { name: "Family", emoji: "🏡" })).id);

    const res = await addPhotos(owner.agent, album.id, [elsewhere.id]);
    expect(res.status).toBe(400);
    expect(await prisma.photoAlbum.count()).toBe(0);

    expect((await addPhotos(owner.agent, album.id, [])).status).toBe(400);
  });

  it("lets only the creator or the group owner rename or delete an album", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob", "carol");
    const [bob, carol] = members as [(typeof members)[0], (typeof members)[0]];
    const bobs = await createAlbum(bob.agent, group.id, "Bob's");
    const photo = await uploadPhoto(carol.agent, group.id);
    await addPhotos(carol.agent, bobs.id, [photo.id]); // anyone can add

    expect((await carol.agent.patch(`/api/albums/${bobs.id}`).send({ name: "Mine now" })).status).toBe(403);
    expect((await carol.agent.delete(`/api/albums/${bobs.id}`)).status).toBe(403);

    const renamed = await bob.agent.patch(`/api/albums/${bobs.id}`).send({ name: "Road trip" });
    expect(renamed.body.album.name).toBe("Road trip");
    expect((await alice.agent.patch(`/api/albums/${bobs.id}`).send({ name: "" })).status).toBe(400);

    expect((await alice.agent.delete(`/api/albums/${bobs.id}`)).status).toBe(204);
    expect(await prisma.album.count()).toBe(0);
    expect(await prisma.photo.count()).toBe(1); // the photo stays
  });

  it("is invisible to non-members, and goes with its group", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const album = await createAlbum(owner.agent, group.id);
    const photo = await uploadPhoto(owner.agent, group.id);
    const carol = await signUp(app, "carol");

    expect((await carol.agent.get(`/api/groups/${group.id}/albums`)).status).toBe(404);
    expect((await carol.agent.post(`/api/groups/${group.id}/albums`).send({ name: "x" })).status).toBe(404);
    expect((await carol.agent.get(`/api/albums/${album.id}`)).status).toBe(404);
    expect((await carol.agent.get(`/api/albums/${album.id}/photos`)).status).toBe(404);
    expect((await addPhotos(carol.agent, album.id, [photo.id])).status).toBe(404);
    expect((await carol.agent.delete(`/api/albums/${album.id}`)).status).toBe(404);
    expect((await carol.agent.get(`/api/photos/${photo.id}/albums`)).status).toBe(404);

    expect((await owner.agent.post(`/api/groups/${group.id}/leave`)).status).toBe(200);
    expect(await prisma.album.count()).toBe(0);
  });

  it("validates names", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const res = await owner.agent.post(`/api/groups/${group.id}/albums`).send({ name: "x".repeat(61) });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: "name", message: "Album names can be at most 60 characters" }]);
    expect((await owner.agent.post(`/api/groups/${group.id}/albums`).send({ name: "  " })).status).toBe(400);
  });
});

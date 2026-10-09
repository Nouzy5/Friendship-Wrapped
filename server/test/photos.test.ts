import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { getObject } from "../src/lib/storage.js";
import {
  createGroup,
  groupWith,
  imageInfo,
  makeImage,
  postPhoto,
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

/** superagent buffers image/* responses, so `body` is the image's bytes. */
async function getImage(agent: Agent, url: string) {
  const res = await agent.get(url);
  return Object.assign(res, { body: res.body as Buffer });
}

/** The object-storage keys behind a photo (never exposed by the API). */
function storedKeys(photoId: string) {
  return prisma.photo.findUniqueOrThrow({
    where: { id: photoId },
    select: { storageKey: true, mediumKey: true, thumbnailKey: true },
  });
}

describe("definition of done: one member posts a photo, another sees it", () => {
  it("stores the photo and lets a fellow member view it in every size", async () => {
    const { owner: nicolas, members, group } = await groupWith(app, "nicolas", "bob");
    const bob = members[0]!;

    const photo = await uploadPhoto(
      nicolas.agent,
      group.id,
      await makeImage({ width: 1600, height: 1200 }),
      "Sunset at the lake 🌅",
    );
    expect(photo).toMatchObject({
      groupId: group.id,
      caption: "Sunset at the lake 🌅",
      width: 1600,
      height: 1200,
      uploader: { id: nicolas.user.id, username: "nicolas", avatarUrl: null },
      canDelete: true,
    });

    const list = await bob.agent.get(`/api/groups/${group.id}/photos`);
    expect(list.status).toBe(200);
    expect(list.body).toEqual({
      photos: [expect.objectContaining({ id: photo.id, caption: "Sunset at the lake 🌅", canDelete: false })],
      nextCursor: null,
    });

    const detail = await bob.agent.get(`/api/photos/${photo.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.photo).toMatchObject({
      id: photo.id,
      group: { id: group.id, name: "The Boys", emoji: "🍻" },
      canDelete: false,
    });

    const expectedSizes = { full: [1600, 1200], medium: [1280, 960], thumbnail: [480, 480] };
    for (const [variant, [width, height]] of Object.entries(expectedSizes)) {
      const image = await getImage(bob.agent, photo.imageUrls[variant as keyof typeof expectedSizes]);
      expect(image.status).toBe(200);
      expect(image.headers["content-type"]).toBe("image/webp");
      expect(image.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
      expect(await imageInfo(image.body)).toMatchObject({ format: "webp", width, height });
    }
  });
});

describe("uploading", () => {
  it("caps the full size at 2560px and never enlarges small photos", async () => {
    const { owner, group } = await groupWith(app, "alice");

    const big = await uploadPhoto(owner.agent, group.id, await makeImage({ width: 4000, height: 3000 }));
    expect([big.width, big.height]).toEqual([2560, 1920]);

    const small = await uploadPhoto(owner.agent, group.id, await makeImage({ width: 300, height: 200 }));
    expect([small.width, small.height]).toEqual([300, 200]);
    const medium = await getImage(owner.agent, small.imageUrls.medium);
    expect(await imageInfo(medium.body)).toMatchObject({ width: 300, height: 200 });
    // Thumbnails stay square: the short side, not 480, when the photo is smaller.
    const thumbnail = await getImage(owner.agent, small.imageUrls.thumbnail);
    expect(await imageInfo(thumbnail.body)).toMatchObject({ width: 200, height: 200 });
  });

  it("applies EXIF orientation and strips all metadata (e.g. location) from stored images", async () => {
    const { owner, group } = await groupWith(app, "alice");
    // Orientation 6 means "rotate 90° clockwise to display".
    const image = await makeImage({ width: 200, height: 100, orientation: 6, exif: { Artist: "Secret Person" } });

    const photo = await uploadPhoto(owner.agent, group.id, image);
    expect([photo.width, photo.height]).toEqual([100, 200]);

    const full = await getImage(owner.agent, photo.imageUrls.full);
    const info = await imageInfo(full.body);
    expect(info.exif).toBeUndefined();
    expect(info.orientation).toBeUndefined();
    expect(full.body.includes("Secret Person")).toBe(false);
  });

  it("accepts PNG, WebP and AVIF as well as JPEG", async () => {
    const { owner, group } = await groupWith(app, "alice");
    for (const format of ["png", "webp", "avif"] as const) {
      await uploadPhoto(owner.agent, group.id, await makeImage({ format }));
    }
    expect(await prisma.photo.count()).toBe(3);
  });

  it("treats a blank caption as no caption and keeps line breaks", async () => {
    const { owner, group } = await groupWith(app, "alice");

    const blank = await postPhoto(owner.agent, group.id, await makeImage(), { caption: "   " });
    expect(blank.body.photo.caption).toBeNull();

    const multiline = await postPhoto(owner.agent, group.id, await makeImage(), { caption: " Day 1\r\nDay 2 " });
    expect(multiline.body.photo.caption).toBe("Day 1\nDay 2");
  });

  it("requires a file", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const res = await postPhoto(owner.agent, group.id, undefined, { caption: "No photo" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Choose a photo or video to upload");
  });

  it("rejects files that aren't images, whatever they claim to be", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const res = await postPhoto(owner.agent, group.id, Buffer.from("definitely not a jpeg"));
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_IMAGE");
  });

  it("rejects truncated images", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const image = await makeImage({ width: 800, height: 600 });
    const res = await postPhoto(owner.agent, group.id, image.subarray(0, image.length / 2));
    expect(res.status).toBe(415);
  });

  it("rejects files over 20 MB", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const res = await postPhoto(owner.agent, group.id, Buffer.alloc(21 * 1024 * 1024));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects images over 64 megapixels before decoding them", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const huge = await makeImage({ width: 8200, height: 8000, format: "png" });
    const res = await postPhoto(owner.agent, group.id, huge);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("IMAGE_TOO_LARGE");
  });

  it("rejects more than one file", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const image = await makeImage();
    const res = await owner.agent
      .post(`/api/groups/${group.id}/photos`)
      .attach("photo", image, "a.jpg")
      .attach("photo", image, "b.jpg");
    expect(res.status).toBe(400);
    expect(await prisma.photo.count()).toBe(0);
  });

  it("validates the caption", async () => {
    const { owner, group } = await groupWith(app, "alice");

    const tooLong = await postPhoto(owner.agent, group.id, await makeImage(), { caption: "x".repeat(501) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.details).toEqual([
      { path: "caption", message: "Captions can be at most 500 characters" },
    ]);

    const control = await postPhoto(owner.agent, group.id, await makeImage(), { caption: "bell\u0007" });
    expect(control.status).toBe(400);
  });
});

describe("privacy", () => {
  it("hides a group's photos from non-members (404, never 403)", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const photo = await uploadPhoto(owner.agent, group.id);
    const carol = await signUp(app, "carol");

    expect((await carol.agent.get(`/api/groups/${group.id}/photos`)).status).toBe(404);
    expect((await carol.agent.get(`/api/photos/${photo.id}`)).status).toBe(404);
    for (const url of Object.values(photo.imageUrls)) {
      expect((await carol.agent.get(url)).status).toBe(404);
    }
    expect((await carol.agent.delete(`/api/photos/${photo.id}`)).status).toBe(404);
    expect(await prisma.photo.count()).toBe(1);
  });

  it("doesn't let non-members post to a group", async () => {
    const { group } = await groupWith(app, "alice");
    const carol = await signUp(app, "carol");

    const res = await postPhoto(carol.agent, group.id, await makeImage());
    expect(res.status).toBe(404);
    expect(await prisma.photo.count()).toBe(0);
  });

  it("requires a session for everything, images included", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const photo = await uploadPhoto(owner.agent, group.id);

    expect((await request(app).get(`/api/groups/${group.id}/photos`)).status).toBe(401);
    expect((await request(app).get(`/api/photos/${photo.id}`)).status).toBe(401);
    expect((await request(app).get(photo.imageUrls.thumbnail)).status).toBe(401);
  });

  it("keeps photos in the group when the uploader leaves, and the uploader can still see their own", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const photo = await uploadPhoto(bob.agent, group.id);

    expect((await bob.agent.post(`/api/groups/${group.id}/leave`)).status).toBe(200);

    expect((await alice.agent.get(`/api/groups/${group.id}/photos`)).body.photos).toHaveLength(1);
    expect((await bob.agent.get(`/api/photos/${photo.id}`)).status).toBe(200);
    expect((await bob.agent.get(`/api/groups/${group.id}/photos`)).status).toBe(404);
  });

  it("rejects malformed ids and sizes", async () => {
    const { owner } = await groupWith(app, "alice");
    expect((await owner.agent.get("/api/photos/not-a-uuid")).status).toBe(400);
    const photo = await uploadPhoto(owner.agent, (await createGroup(owner.agent)).id);
    expect((await owner.agent.get(`/api/photos/${photo.id}/images/original`)).status).toBe(400);
  });
});

describe("deleting", () => {
  it("lets only the uploader delete, and removes the stored files", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const photo = await uploadPhoto(alice.agent, group.id);
    const keys = Object.values(await storedKeys(photo.id));

    const byBob = await bob.agent.delete(`/api/photos/${photo.id}`);
    expect(byBob.status).toBe(403);
    expect(byBob.body.error.message).toBe("Only the person who posted a photo can delete it");

    expect((await alice.agent.delete(`/api/photos/${photo.id}`)).status).toBe(204);
    expect((await bob.agent.get(`/api/photos/${photo.id}`)).status).toBe(404);
    expect((await alice.agent.get(photo.imageUrls.full)).status).toBe(404);
    for (const key of keys) expect(await getObject(key)).toBeNull();
  });

  it("removes a group's stored files when its last member leaves", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const photo = await uploadPhoto(owner.agent, group.id);
    const keys = Object.values(await storedKeys(photo.id));

    const res = await owner.agent.post(`/api/groups/${group.id}/leave`);
    expect(res.body).toEqual({ groupDeleted: true });

    expect(await prisma.photo.count()).toBe(0);
    for (const key of keys) expect(await getObject(key)).toBeNull();
  });
});

describe("listing", () => {
  it("pages newest first with a cursor", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const first = await uploadPhoto(owner.agent, group.id, undefined, "first");
    const second = await uploadPhoto(owner.agent, group.id, undefined, "second");
    const third = await uploadPhoto(owner.agent, group.id, undefined, "third");

    const page1 = await owner.agent.get(`/api/groups/${group.id}/photos?limit=2`);
    expect(page1.body.photos.map((p: PhotoBody) => p.id)).toEqual([third.id, second.id]);
    expect(page1.body.nextCursor).toEqual(expect.any(String));

    const page2 = await owner.agent.get(`/api/groups/${group.id}/photos?limit=2&cursor=${page1.body.nextCursor}`);
    expect(page2.body.photos.map((p: PhotoBody) => p.id)).toEqual([first.id]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it("rejects a bad cursor or limit", async () => {
    const { owner, group } = await groupWith(app, "alice");
    expect((await owner.agent.get(`/api/groups/${group.id}/photos?cursor=nope`)).status).toBe(400);
    expect((await owner.agent.get(`/api/groups/${group.id}/photos?limit=500`)).status).toBe(400);
  });
});

describe("viewer navigation", () => {
  type Feed = { newerId: string | null; olderId: string | null } | null;

  async function feedOf(agent: Agent, photoId: string): Promise<Feed> {
    const res = await agent.get(`/api/photos/${photoId}`);
    expect(res.status).toBe(200);
    return res.body.photo.feed;
  }

  /** Follows one direction's links from a photo to the end of the feed, like swiping through the viewer. */
  async function walk(agent: Agent, fromId: string, direction: "newerId" | "olderId"): Promise<string[]> {
    const visited = [fromId];
    for (let id = (await feedOf(agent, fromId))![direction]; id; id = (await feedOf(agent, id))![direction]) {
      visited.push(id);
    }
    return visited;
  }

  it("links each photo to the newer and older one in its group's feed, and only within that group", async () => {
    const { owner: alice, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const otherGroup = await createGroup(alice.agent, { name: "Family", emoji: "🏡" });

    const oldest = await uploadPhoto(alice.agent, group.id);
    const elsewhere = await uploadPhoto(alice.agent, otherGroup.id);
    const middle = await uploadPhoto(bob.agent, group.id);
    const newest = await uploadPhoto(alice.agent, group.id);

    expect(await feedOf(bob.agent, newest.id)).toEqual({ newerId: null, olderId: middle.id });
    expect(await feedOf(bob.agent, middle.id)).toEqual({ newerId: newest.id, olderId: oldest.id });
    expect(await feedOf(bob.agent, oldest.id)).toEqual({ newerId: middle.id, olderId: null });
    expect(await feedOf(alice.agent, elsewhere.id)).toEqual({ newerId: null, olderId: null });
  });

  it("follows the feed's order exactly, even when upload times tie", async () => {
    const { owner, group } = await groupWith(app, "alice");
    for (let i = 0; i < 4; i++) await uploadPhoto(owner.agent, group.id);
    await prisma.photo.updateMany({ data: { createdAt: new Date("2026-08-01T12:00:00.000Z") } });

    const list = await owner.agent.get(`/api/groups/${group.id}/photos`);
    const feedOrder = (list.body.photos as PhotoBody[]).map((photo) => photo.id);

    expect(feedOrder).toHaveLength(4);
    expect(await walk(owner.agent, feedOrder[0]!, "olderId")).toEqual(feedOrder);
    expect(await walk(owner.agent, feedOrder.at(-1)!, "newerId")).toEqual(feedOrder.toReversed());
  });

  it("doesn't let an uploader who left browse the group through their own photo", async () => {
    const { members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    await uploadPhoto(bob.agent, group.id);
    const photo = await uploadPhoto(bob.agent, group.id);

    expect((await bob.agent.post(`/api/groups/${group.id}/leave`)).status).toBe(200);
    expect(await feedOf(bob.agent, photo.id)).toBeNull();
  });
});

describe("profile pictures", () => {
  function putAvatar(agent: Agent, image: Buffer) {
    return agent.put("/api/users/me/avatar").attach("avatar", image, { filename: "me.png", contentType: "image/png" });
  }

  it("uploads a square avatar that group-mates can see but strangers can't", async () => {
    const { owner: alice, members } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const carol = await signUp(app, "carol");

    const res = await putAvatar(alice.agent, await makeImage({ width: 600, height: 400, format: "png" }));
    expect(res.status).toBe(200);
    const avatarUrl: string = res.body.user.avatarUrl;
    expect(avatarUrl).toMatch(new RegExp(`^/api/users/${alice.user.id}/avatar\\?v=[0-9a-f]{16}$`));

    for (const agent of [alice.agent, bob.agent]) {
      const image = await getImage(agent, avatarUrl);
      expect(image.status).toBe(200);
      expect(await imageInfo(image.body)).toMatchObject({ format: "webp", width: 256, height: 256 });
    }
    expect((await carol.agent.get(avatarUrl)).status).toBe(404);

    // It shows up wherever Alice does.
    expect((await alice.agent.get("/api/auth/session")).body.user.avatarUrl).toBe(avatarUrl);
    const groups = await bob.agent.get("/api/groups");
    const membersRes = await bob.agent.get(`/api/groups/${groups.body.groups[0].id}/members`);
    expect(membersRes.body.members[0].user).toMatchObject({ username: "alice", avatarUrl });
  });

  it("replaces and removes the avatar, deleting old files", async () => {
    const alice = await signUp(app, "alice");

    const first = await putAvatar(alice.agent, await makeImage({ format: "png" }));
    const firstKey = (await prisma.user.findUniqueOrThrow({ where: { id: alice.user.id } })).avatarKey!;

    const second = await putAvatar(alice.agent, await makeImage({ format: "png" }));
    expect(second.body.user.avatarUrl).not.toBe(first.body.user.avatarUrl);
    expect(await getObject(firstKey)).toBeNull();
    const secondKey = (await prisma.user.findUniqueOrThrow({ where: { id: alice.user.id } })).avatarKey!;

    const removed = await alice.agent.delete("/api/users/me/avatar");
    expect(removed.status).toBe(200);
    expect(removed.body.user.avatarUrl).toBeNull();
    expect(await getObject(secondKey)).toBeNull();
    expect((await alice.agent.get(`/api/users/${alice.user.id}/avatar`)).status).toBe(404);
  });

  it("validates avatar uploads like photos", async () => {
    const alice = await signUp(app, "alice");
    expect((await putAvatar(alice.agent, Buffer.from("nope"))).status).toBe(415);
    expect((await alice.agent.put("/api/users/me/avatar")).status).toBe(400);
    expect((await request(app).put("/api/users/me/avatar")).status).toBe(401);
  });
});

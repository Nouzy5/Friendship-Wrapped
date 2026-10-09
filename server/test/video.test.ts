import { mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request, { type Response } from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { setPushSender, type PushPayload, type PushTarget } from "../src/lib/push.js";
import * as storage from "../src/lib/storage.js";
import { sweepStaleUploads } from "../src/lib/upload.js";
import { settleNotifications } from "../src/modules/notifications/notifications.service.js";
import {
  groupWith,
  hasFfmpeg,
  imageInfo,
  makeImage,
  makeVideo,
  postPhoto,
  postVideo,
  probeBytes,
  resetDatabase,
  resetStorage,
  uploadPhoto,
  uploadVideo,
  type Agent,
} from "./helpers.js";

const app = createApp();

let sent: { endpoint: string; payload: PushPayload }[] = [];

beforeEach(async () => {
  await resetDatabase();
  await resetStorage();
  sent = [];
  setPushSender(async (target: PushTarget, payload: PushPayload) => {
    sent.push({ endpoint: target.endpoint, payload });
  });
});

afterEach(async () => {
  await settleNotifications();
  setPushSender(null);
});

afterAll(async () => {
  await resetDatabase();
  await resetStorage();
  await prisma.$disconnect();
});

/** These need ffmpeg and ffprobe, which a machine without them can't run. */
const withVideo = describe.skipIf(!hasFfmpeg);

/** Collects a binary response body. */
function binary(res: Response, callback: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

const fetchVideo = (agent: Agent | ReturnType<typeof request>, url: string, headers: Record<string, string> = {}) => {
  const req = agent.get(url);
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req.buffer(true).parse(binary);
};

/** Temporary files the server made for uploads and conversions and hasn't removed. */
async function leftovers() {
  return (await readdir(tmpdir())).filter((name) => name.startsWith("fw-upload-") || name.startsWith("fw-video-"));
}

withVideo("posting a video", () => {
  it("converts it to a small MP4 and uses a frame as the poster, like any photo", async () => {
    const { members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const source = await makeVideo({ seconds: 2, width: 320, height: 240 });

    const photo = await uploadVideo(bob.agent, group.id, source, { caption: "Sunset" });
    expect(photo).toMatchObject({
      kind: "video",
      caption: "Sunset",
      width: 320,
      height: 240,
      canSave: true,
      canDelete: true,
      video: { url: `/api/photos/${photo.id}/video`, isLive: false },
    });
    expect(photo.video!.durationMs).toBeGreaterThan(1500);
    expect(photo.video!.durationMs).toBeLessThan(2600);

    // Its three images are real pictures of the video, served like a photo's.
    for (const variant of ["thumbnail", "medium", "full"] as const) {
      const image = await bob.agent.get(photo.imageUrls[variant]).buffer(true).parse(binary);
      expect(image.status).toBe(200);
      expect((await imageInfo(image.body as Buffer)).format).toBe("webp");
    }

    const video = await fetchVideo(bob.agent, photo.video!.url);
    expect(video.status).toBe(200);
    expect(video.headers["content-type"]).toBe("video/mp4");
    expect(video.headers["accept-ranges"]).toBe("bytes");
    expect(video.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
    expect(Number(video.headers["content-length"])).toBe(photo.video!.sizeBytes);
    expect((video.body as Buffer).length).toBe(photo.video!.sizeBytes);

    const probed = await probeBytes(video.body as Buffer);
    expect(probed.streams.map((s) => s.codec_name).toSorted()).toEqual(["aac", "h264"]);

    // The rest of the group sees it too.
    const alicesView = await members[0]!.agent.get(`/api/photos/${photo.id}`);
    expect(alicesView.body.photo).toMatchObject({ kind: "video", video: { isLive: false } });
    expect(await leftovers()).toEqual([]);
  });

  it("drops where it was filmed and other tags, and keeps it to 1280 pixels", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const source = await makeVideo({
      seconds: 1,
      width: 1920,
      height: 1080,
      tags: { location: "+48.8584+002.2945/", title: "Secret", comment: "Private note" },
    });
    expect(JSON.stringify((await probeBytes(source)).format.tags)).toContain("+48.8584");

    const photo = await uploadVideo(owner.agent, group.id, source);
    expect(photo.width).toBe(1280);
    expect(photo.height).toBe(720);

    const stored = await fetchVideo(owner.agent, photo.video!.url);
    const probed = await probeBytes(stored.body as Buffer);
    const tags = JSON.stringify([probed.format.tags ?? {}, ...probed.streams.map((s) => s.tags ?? {})]).toLowerCase();
    for (const secret of ["48.8584", "secret", "private note", "location"]) expect(tags).not.toContain(secret);
    const video = probed.streams.find((s) => s.codec_type === "video")!;
    expect([video.width, video.height]).toEqual([1280, 720]);
  });

  it("accepts a video with no sound", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const photo = await uploadVideo(owner.agent, group.id, await makeVideo({ audio: false }));
    const stored = await fetchVideo(owner.agent, photo.video!.url);
    expect((await probeBytes(stored.body as Buffer)).streams.map((s) => s.codec_type)).toEqual(["video"]);
  });

  it("makes a Live Photo from a still and its motion, posting the still as the picture", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const still = await makeImage({ width: 90, height: 120 });
    const res = await postVideo(owner.agent, group.id, await makeVideo({ seconds: 1.5 }), { live: "true" }, still);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const photo = res.body.photo;
    expect(photo).toMatchObject({ kind: "video", width: 90, height: 120, video: { isLive: true } });
    // The poster is the still, not a frame of the video.
    const full = await owner.agent.get(photo.imageUrls.full).buffer(true).parse(binary);
    expect(await imageInfo(full.body as Buffer)).toMatchObject({ width: 90, height: 120 });
  });

  it("is a post like any other: reactions, comments, favourites, the feed and moments all work", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    const bob = members[0]!;
    const moment = (await owner.agent.post(`/api/groups/${group.id}/moments`).send({ title: "Lake" })).body.moment;
    const photo = await uploadVideo(bob.agent, group.id, undefined, { momentId: moment.id });
    expect(photo.momentId).toBe(moment.id);

    expect((await owner.agent.put(`/api/photos/${photo.id}/reaction`).send({ type: "HEART" })).status).toBe(200);
    expect((await owner.agent.post(`/api/photos/${photo.id}/comments`).send({ body: "wow" })).status).toBe(201);
    expect((await owner.agent.put(`/api/photos/${photo.id}/favorite`)).status).toBe(200);

    const feed = await owner.agent.get(`/api/groups/${group.id}/photos`);
    expect(feed.body.photos).toHaveLength(1);
    expect(feed.body.photos[0]).toMatchObject({
      id: photo.id,
      kind: "video",
      commentCount: 1,
      isFavorite: true,
      reactions: { total: 1, mine: "HEART" },
    });
    const inMoment = await owner.agent.get(`/api/moments/${moment.id}/photos`);
    expect(inMoment.body.photos.map((p: { id: string; kind: string }) => [p.id, p.kind])).toEqual([[photo.id, "video"]]);
    expect((await owner.agent.get(`/api/groups/${group.id}/moments`)).body.moments[0].photoCount).toBe(1);
  });

  it("tells the group it's a video", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    await owner.agent.post("/api/notifications/subscriptions").send({
      endpoint: "https://push.example.com/send/alice",
      keys: { p256dh: "BKey-alice", auth: "auth-alice" },
    });
    const photo = await uploadVideo(members[0]!.agent, group.id);

    await settleNotifications();
    expect(sent.map((s) => s.payload)).toEqual([
      { title: "🍻 The Boys", body: "Bob posted a video", url: `/photos/${photo.id}`, tag: `photos:${group.id}` },
    ]);
  });
});

withVideo("what is refused", () => {
  const refusal = async (agent: Agent, groupId: string, file: Buffer, name = "clip.mp4") => {
    const before = await leftovers();
    const res = await postVideo(agent, groupId, file, {}, undefined, name);
    expect(await leftovers()).toEqual(before);
    expect(await prisma.photo.count()).toBe(0);
    return res;
  };

  it("files that aren't videos, whatever they're called", async () => {
    const { owner, group } = await groupWith(app, "alice");
    for (const file of [
      Buffer.from("just some text, not a video at all"),
      await makeImage(),
      Buffer.alloc(0),
      Buffer.alloc(8),
    ]) {
      const res = await refusal(owner.agent, group.id, file);
      expect(res.status, JSON.stringify(res.body)).toBe(415);
      expect(res.body.error.code).toBe("UNSUPPORTED_VIDEO");
    }
  });

  it("playlists and scripts that point ffmpeg at other files or addresses", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const files = [
      "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nhttp://127.0.0.1:9999/secret.ts\n#EXT-X-ENDLIST\n",
      "ffconcat version 1.0\nfile '/etc/passwd'\n",
      "#EXTM3U\n#EXTINF:1,\nfile:///etc/hosts\n",
    ];
    for (const text of files) {
      const res = await refusal(owner.agent, group.id, Buffer.from(text), "evil.m3u8");
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe("UNSUPPORTED_VIDEO");
    }
  });

  it("a video cut off partway, or that only looks like one", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const real = await makeVideo();
    const fake = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(200, 7)]);
    for (const file of [real.subarray(0, 700), fake]) {
      const res = await refusal(owner.agent, group.id, file);
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe("UNSUPPORTED_VIDEO");
    }
  });

  it("a video over a minute long", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const res = await refusal(owner.agent, group.id, await makeVideo({ seconds: 75, width: 64, height: 48, fps: 1 }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("VIDEO_TOO_LONG");
  });

  it("a video that is just under the limit is kept whole", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const photo = await uploadVideo(owner.agent, group.id, await makeVideo({ seconds: 60, width: 64, height: 48, fps: 1 }));
    expect(photo.video!.durationMs).toBeGreaterThan(59_000);
  });

  it("an upload over the size limit, leaving nothing behind", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const res = await refusal(owner.agent, group.id, Buffer.alloc(101 * 1024 * 1024, 1));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("FILE_TOO_LARGE");
    expect(res.body.error.message).toBe("Videos can be at most 100 MB");
  });

  it("a post with neither a photo nor a video, and photos that are too big as before", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const none = await postPhoto(owner.agent, group.id, undefined, { caption: "nothing" });
    expect(none.status).toBe(400);
    const big = await postPhoto(owner.agent, group.id, Buffer.alloc(21 * 1024 * 1024, 1));
    expect(big.status).toBe(413);
    expect(big.body.error.message).toBe("Photos can be at most 20 MB");
  });

  it("people who aren't in the group (and nothing is converted for them)", async () => {
    const { group } = await groupWith(app, "alice");
    const { owner: stranger } = await groupWith(app, "mallory");
    const res = await postVideo(stranger.agent, group.id, await makeVideo());
    expect(res.status).toBe(404);
    expect(await leftovers()).toEqual([]);
    expect((await postVideo(request.agent(app), group.id, await makeVideo())).status).toBe(401);
  });

  it("a closed moment, removing what it stored", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const moment = (await owner.agent.post(`/api/groups/${group.id}/moments`).send({ title: "Lake" })).body.moment;
    await prisma.moment.update({ where: { id: moment.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const res = await postVideo(owner.agent, group.id, await makeVideo(), { momentId: moment.id });
    expect(res.status).toBe(409);
    expect(await leftovers()).toEqual([]);
    expect(await prisma.photo.count()).toBe(0);
  });
});

withVideo("playing a video", () => {
  async function postedVideo() {
    const { owner, members, group } = await groupWith(app, "alice", "bob", "carol");
    const photo = await uploadVideo(members[0]!.agent, group.id);
    const full = (await fetchVideo(members[0]!.agent, photo.video!.url)).body as Buffer;
    return { alice: owner, bob: members[0]!, carol: members[1]!, group, photo, full };
  }

  it("sends the part asked for, so players start at once and can seek", async () => {
    const { alice, photo, full } = await postedVideo();
    const url = photo.video!.url;
    const size = full.length;
    expect(size).toBeGreaterThan(2000);

    const head = await fetchVideo(alice.agent, url, { Range: "bytes=0-999" });
    expect(head.status).toBe(206);
    expect(head.headers["content-range"]).toBe(`bytes 0-999/${size}`);
    expect(head.headers["content-length"]).toBe("1000");
    expect((head.body as Buffer).equals(full.subarray(0, 1000))).toBe(true);

    const middle = await fetchVideo(alice.agent, url, { Range: "bytes=1000-1499" });
    expect(middle.status).toBe(206);
    expect((middle.body as Buffer).equals(full.subarray(1000, 1500))).toBe(true);

    const rest = await fetchVideo(alice.agent, url, { Range: "bytes=1500-" });
    expect(rest.status).toBe(206);
    expect(rest.headers["content-range"]).toBe(`bytes 1500-${size - 1}/${size}`);
    expect((rest.body as Buffer).equals(full.subarray(1500))).toBe(true);

    const tail = await fetchVideo(alice.agent, url, { Range: "bytes=-100" });
    expect(tail.status).toBe(206);
    expect(tail.headers["content-range"]).toBe(`bytes ${size - 100}-${size - 1}/${size}`);
    expect((tail.body as Buffer).equals(full.subarray(size - 100))).toBe(true);

    // An end past the file is cut back to it.
    const over = await fetchVideo(alice.agent, url, { Range: `bytes=${size - 10}-${size + 5000}` });
    expect(over.status).toBe(206);
    expect(over.headers["content-range"]).toBe(`bytes ${size - 10}-${size - 1}/${size}`);
    expect((over.body as Buffer).length).toBe(10);

    // The very last byte.
    const last = await fetchVideo(alice.agent, url, { Range: `bytes=${size - 1}-${size - 1}` });
    expect(last.status).toBe(206);
    expect((last.body as Buffer).length).toBe(1);
  });

  it("refuses a range that starts past the end, and ignores ones it doesn't understand", async () => {
    const { alice, photo, full } = await postedVideo();
    const url = photo.video!.url;
    const size = full.length;

    for (const range of [`bytes=${size}-`, `bytes=${size + 100}-${size + 200}`, "bytes=-0"]) {
      const res = await alice.agent.get(url).set("Range", range);
      expect(res.status, range).toBe(416);
      expect(res.headers["content-range"]).toBe(`bytes */${size}`);
    }

    // Several ranges, another unit, nonsense and backwards ranges all get the whole file.
    for (const range of ["bytes=0-1,5-6", "items=0-10", "bytes=abc", "bytes=10-5", "bytes=-", "bytes=0-1-2"]) {
      const res = await fetchVideo(alice.agent, url, { Range: range });
      expect(res.status, range).toBe(200);
      expect((res.body as Buffer).equals(full), range).toBe(true);
    }
  });

  it("is only for people who can see the post", async () => {
    const { bob, alice, group, photo } = await postedVideo();
    const url = photo.video!.url;

    expect((await request(app).get(url)).status).toBe(401);

    const { owner: stranger } = await groupWith(app, "mallory");
    expect((await stranger.agent.get(url)).status).toBe(404);
    expect((await stranger.agent.get(url).set("Range", "bytes=0-10")).status).toBe(404);

    // A photo has no video.
    const still = await postPhoto(bob.agent, group.id, await makeImage());
    expect((await alice.agent.get(`/api/photos/${still.body.photo.id}/video`)).status).toBe(404);
    expect([400, 404]).toContain((await alice.agent.get("/api/photos/nope/video")).status);

    // Blocking hides the post, video and all, in both directions.
    expect((await alice.agent.put(`/api/users/me/blocks/${bob.user.id}`)).status).toBeLessThan(300);
    expect((await alice.agent.get(url)).status).toBe(404);
    expect((await bob.agent.get(url)).status).toBe(200);
  });

  it("can be saved by those the person allows, as an attachment that isn't cached", async () => {
    const { alice, bob, photo, full } = await postedVideo();
    const url = `${photo.video!.url}?download=1`;

    const saved = await fetchVideo(alice.agent, url);
    expect(saved.status).toBe(200);
    expect(saved.headers["content-disposition"]).toMatch(/^attachment; filename="friendship-wrapped-\d{4}-\d{2}-\d{2}\.mp4"$/);
    expect(saved.headers["cache-control"]).toBe("no-store");
    expect((saved.body as Buffer).equals(full)).toBe(true);

    // Bob turns saving off: others are refused (and told so), but he can still save his own.
    expect((await bob.agent.patch("/api/users/me/settings").send({ allowPhotoSaving: false })).status).toBe(200);
    const refused = await alice.agent.get(url);
    expect(refused.status).toBe(403);
    expect((await alice.agent.get(`/api/photos/${photo.id}`)).body.photo.canSave).toBe(false);
    expect((await fetchVideo(bob.agent, url)).status).toBe(200);
    // Playing it is not saving it.
    expect((await fetchVideo(alice.agent, photo.video!.url)).status).toBe(200);
  });
});

withVideo("removing a video", () => {
  const keysOf = async (photoId: string) => {
    const row = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    return { video: row.videoKey!, images: [row.storageKey, row.mediumKey, row.thumbnailKey] };
  };

  it("deletes the file along with the post", async () => {
    const { members, group } = await groupWith(app, "alice", "bob");
    const photo = await uploadVideo(members[0]!.agent, group.id);
    const keys = await keysOf(photo.id);
    expect(await storage.getObject(keys.video)).not.toBeNull();

    expect((await members[0]!.agent.delete(`/api/photos/${photo.id}`)).status).toBe(204);
    expect(await storage.getObject(keys.video)).toBeNull();
    for (const key of keys.images) expect(await storage.getObject(key)).toBeNull();
    expect((await members[0]!.agent.get(photo.video!.url)).status).toBe(404);
  });

  it("deletes it with the account, and with the group", async () => {
    const { owner, members, group } = await groupWith(app, "alice", "bob");
    const bobs = await uploadVideo(members[0]!.agent, group.id);
    const alices = await uploadVideo(owner.agent, group.id);
    const bobKeys = await keysOf(bobs.id);
    const aliceKeys = await keysOf(alices.id);

    const deleted = await members[0]!.agent.delete("/api/users/me").send({ password: "correct horse battery staple" });
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);
    await settleNotifications();
    expect(await storage.getObject(bobKeys.video)).toBeNull();
    expect(await storage.getObject(aliceKeys.video)).not.toBeNull();

    // The last member leaving deletes the group and everything stored for it.
    expect((await owner.agent.post(`/api/groups/${group.id}/leave`)).body).toEqual({ groupDeleted: true });
    expect(await storage.getObject(aliceKeys.video)).toBeNull();
  });
});

withVideo("the photo archive", () => {
  it("holds the video itself, as an .mp4", async () => {
    const { owner, group } = await groupWith(app, "alice");
    await uploadVideo(owner.agent, group.id);
    await uploadPhoto(owner.agent, group.id);

    const res = await owner.agent.get("/api/users/me/photos/archive").buffer(true).parse(binary);
    expect(res.status).toBe(200);
    const names = zipEntries(res.body as Buffer).map((name) => name.split(".").pop());
    expect(names.toSorted()).toEqual(["mp4", "webp"]);
  });
});

describe("temporary upload files", () => {
  it("left behind by a crash are cleared once they're old, and nothing else is touched", async () => {
    const old = join(tmpdir(), "fw-upload-test-old");
    const oldFolder = join(tmpdir(), "fw-video-test-old");
    const fresh = join(tmpdir(), "fw-upload-test-fresh");
    const unrelated = join(tmpdir(), "fw-test-unrelated");
    await writeFile(old, "x");
    await mkdir(oldFolder, { recursive: true });
    await writeFile(join(oldFolder, "video.mp4"), "x");
    await writeFile(fresh, "x");
    await writeFile(unrelated, "x");
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (const path of [old, oldFolder, unrelated]) await utimes(path, twoHoursAgo, twoHoursAgo);

    try {
      await sweepStaleUploads();
      const left = await readdir(tmpdir());
      expect(left).not.toContain("fw-upload-test-old");
      expect(left).not.toContain("fw-video-test-old");
      expect(left).toContain("fw-upload-test-fresh");
      expect(left).toContain("fw-test-unrelated");
    } finally {
      await Promise.all([fresh, unrelated, old, oldFolder].map((path) => rm(path, { recursive: true, force: true })));
    }
  });
});

/** The file names in a zip, from its central directory. */
function zipEntries(zip: Buffer): string[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

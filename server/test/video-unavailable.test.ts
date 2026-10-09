import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { groupWith, makeImage, postPhoto, postVideo, resetDatabase, resetStorage } from "./helpers.js";

// A server without ffmpeg: videos are turned away plainly, and photos carry on.
vi.mock("../src/lib/ffmpeg.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/ffmpeg.js")>()),
  videoSupported: async () => false,
}));

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

describe("a server without ffmpeg", () => {
  it("says videos can't be posted yet, and still takes photos", async () => {
    const { owner, group } = await groupWith(app, "alice");
    const video = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(100)]);

    const refused = await postVideo(owner.agent, group.id, video);
    expect(refused.status).toBe(503);
    expect(refused.body.error.code).toBe("VIDEO_UNAVAILABLE");
    expect(await prisma.photo.count()).toBe(0);

    expect((await postPhoto(owner.agent, group.id, await makeImage())).status).toBe(201);
  });
});

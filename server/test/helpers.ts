import type { Express } from "express";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import request, { type Response } from "supertest";
import { expect } from "vitest";
import { env } from "../src/config/env.js";
import { videoSupported } from "../src/lib/ffmpeg.js";
import { setMailTransport, type MailMessage, type MailTransport } from "../src/lib/mail.js";
import { prisma } from "../src/lib/prisma.js";
import { deletePrefix } from "../src/lib/storage.js";

/** Deletes all rows, children before parents. */
export async function resetDatabase(): Promise<void> {
  await prisma.queuedNotification.deleteMany();
  await prisma.apnsDevice.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.report.deleteMany();
  await prisma.block.deleteMany();
  await prisma.userSettings.deleteMany();
  await prisma.wrapped.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.reaction.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.photoAlbum.deleteMany();
  await prisma.album.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.inviteToken.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

export const testUser = {
  email: "alice@example.com",
  username: "alice",
  displayName: "Alice",
  password: "correct horse battery staple",
};

export type TestUser = { id: string; username: string; displayName: string };

/** The address `signUp` gives a user. */
export const emailOf = (username: string) => `${username}@example.com`;

/** Registers `username` and returns a cookie-keeping agent signed in as them (a "browser"). Their email is already verified. */
export async function signUp(app: Express, username: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({
    email: emailOf(username),
    username,
    displayName: username[0]!.toUpperCase() + username.slice(1),
    password: testUser.password,
  });
  if (res.status !== 201) throw new Error(`signUp(${username}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  const user = res.body.user as TestUser;
  await verifyEmailNow(user.id);
  return { agent, user };
}

/** Marks an account's email verified without going through the emailed link. */
export async function verifyEmailNow(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
}

export type SentMail = MailMessage & { from: string };

/** A mail transport that files every message into `sent`. */
export function mailTransportInto(sent: SentMail[]): MailTransport {
  return {
    send: async (message) => {
      sent.push(message);
    },
    verify: async () => {},
  };
}

/**
 * Routes outgoing email into the returned list instead of an SMTP server, for as long as the test
 * file runs. Call `await settleMail()` before looking: emails are sent in the background.
 */
export function captureMail(): SentMail[] {
  const sent: SentMail[] = [];
  setMailTransport(mailTransportInto(sent));
  return sent;
}

/** The token in the link of a verification email, as the person would open it. */
export function verificationTokenIn(mail: SentMail): string {
  const token = /[?&]token=([A-Za-z0-9_-]{43})/.exec(mail.text)?.[1];
  if (!token) throw new Error(`No verification link in: ${mail.text}`);
  return token;
}

export type Agent = ReturnType<typeof request.agent>;

export async function createGroup(agent: Agent, body: object = { name: "The Boys", emoji: "🍻" }) {
  const res = await agent.post("/api/groups").send(body);
  expect(res.status).toBe(201);
  return res.body.group as { id: string };
}

export async function createInvite(agent: Agent, groupId: string): Promise<string> {
  const res = await agent.post(`/api/groups/${groupId}/invites`);
  expect(res.status).toBe(201);
  return res.body.invite.token;
}

/** The first user creates "The Boys" and each other user joins through an invite, in order. */
export async function groupWith(app: Express, ...usernames: string[]) {
  const [ownerName, ...memberNames] = usernames;
  const owner = await signUp(app, ownerName!);
  const group = await createGroup(owner.agent);
  const token = await createInvite(owner.agent, group.id);

  const members = [];
  for (const name of memberNames) {
    const member = await signUp(app, name);
    expect((await member.agent.post(`/api/invites/${token}/accept`)).status).toBe(200);
    members.push(member);
  }
  return { owner, members, group, token };
}

/** Empties the test bucket (every key lives under one of these prefixes). */
export async function resetStorage(): Promise<void> {
  await deletePrefix("groups/");
  await deletePrefix("users/");
}

type ImageOptions = {
  width?: number;
  height?: number;
  format?: "jpeg" | "png" | "webp" | "avif";
  /** EXIF orientation tag (1–8) to embed. */
  orientation?: number;
  /** EXIF IFD0 tags to embed, e.g. { Artist: "…" }. */
  exif?: Record<string, string>;
};

/** A real, encoded image (a solid colour), as a phone or browser would upload it. */
export function makeImage({ width = 64, height = 48, format = "jpeg", orientation, exif }: ImageOptions = {}) {
  let image = sharp({ create: { width, height, channels: 3, background: { r: 255, g: 61, b: 127 } } });
  if (exif) image = image.withExif({ IFD0: exif });
  if (orientation) image = image.withMetadata({ orientation });
  return image.toFormat(format).toBuffer();
}

/** A photo as the API returns it (the fields tests look at). */
export type PhotoBody = {
  id: string;
  groupId: string;
  momentId: string | null;
  caption: string | null;
  width: number;
  height: number;
  imageUrls: { full: string; medium: string; thumbnail: string };
  kind: "photo" | "video";
  video: { url: string; durationMs: number; sizeBytes: number; isLive: boolean } | null;
  canSave: boolean;
  canDelete: boolean;
  canInteract: boolean;
  reactions: { counts: Record<string, number>; total: number; mine: string | null };
  commentCount: number;
  isFavorite: boolean;
};

export function postPhoto(agent: Agent, groupId: string, image?: Buffer, fields: Record<string, string> = {}) {
  const req = agent.post(`/api/groups/${groupId}/photos`);
  for (const [name, value] of Object.entries(fields)) req.field(name, value);
  if (image) req.attach("photo", image, { filename: "photo.jpg", contentType: "image/jpeg" });
  return req;
}

/** Posts a photo (a small generated JPEG unless one is given) and returns it. */
export async function uploadPhoto(agent: Agent, groupId: string, image?: Buffer, caption?: string) {
  const res = await postPhoto(agent, groupId, image ?? (await makeImage()), caption ? { caption } : {});
  expect(res.status).toBe(201);
  return res.body.photo as PhotoBody;
}

/** Posts a photo, then backdates it (uploads are always "now"). */
export async function photoAt(agent: Agent, groupId: string, at: string) {
  const photo = await uploadPhoto(agent, groupId);
  await prisma.photo.update({ where: { id: photo.id }, data: { createdAt: new Date(at) } });
  return photo;
}

/** Reacts through the API, then backdates the reaction. */
export async function reactAt(agent: Agent, userId: string, photoId: string, type: string, at: string) {
  expect((await agent.put(`/api/photos/${photoId}/reaction`).send({ type })).status).toBe(200);
  await prisma.reaction.update({
    where: { photoId_userId: { photoId, userId } },
    data: { createdAt: new Date(at) },
  });
}

/** Comments through the API, then backdates the comment. */
export async function commentAt(agent: Agent, photoId: string, at: string) {
  const res = await agent.post(`/api/photos/${photoId}/comments`).send({ body: "🔥" });
  expect(res.status).toBe(201);
  await prisma.comment.update({ where: { id: res.body.comment.id }, data: { createdAt: new Date(at) } });
}

/** Decodes an image response, for asserting on what the server actually stored. */
export function imageInfo(data: Buffer) {
  return sharp(data).metadata();
}

/** The full `Set-Cookie` header for the session cookie, if the response set one. */
export function sessionSetCookie(res: Response): string | undefined {
  const header: unknown = res.headers["set-cookie"];
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  return cookies.find((cookie) => cookie.startsWith("fw_session="));
}

/** Just the `name=value` pair, ready to send back in a `Cookie` header. */
export function sessionCookiePair(res: Response): string {
  const cookie = sessionSetCookie(res)?.split(";")[0];
  if (!cookie) throw new Error("Response did not set a session cookie");
  return cookie;
}

// ---------------------------------------------------------------------------------------
// Videos (these need ffmpeg, which tests skip themselves without)

/** Whether ffmpeg and ffprobe run here. */
export const hasFfmpeg = await videoSupported();

function runTool(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(`${command} failed: ${stderr.slice(-500)}`))));
  });
}

type VideoOptions = {
  seconds?: number;
  width?: number;
  height?: number;
  audio?: boolean;
  /** Embedded tags, like the place a phone filmed it. */
  tags?: Record<string, string>;
  fps?: number;
};

/** A real, encoded MP4 (a test pattern), as a phone would send it. */
export async function makeVideo({ seconds = 2, width = 320, height = 240, audio = true, tags = {}, fps = 10 }: VideoOptions = {}) {
  const folder = await mkdtemp(join(tmpdir(), "fw-test-video-"));
  try {
    const out = join(folder, "in.mp4");
    const args = ["-y", "-v", "error", "-f", "lavfi", "-i", `testsrc=duration=${seconds}:size=${width}x${height}:rate=${fps}`];
    if (audio) args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`);
    args.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p");
    if (audio) args.push("-c:a", "aac");
    for (const [name, value] of Object.entries(tags)) args.push("-metadata", `${name}=${value}`);
    args.push("-movflags", "+faststart", out);
    await runTool(env.FFMPEG_PATH ?? "ffmpeg", args);
    return await readFile(out);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export type ProbeResult = {
  streams: { codec_type: string; codec_name: string; width?: number; height?: number; tags?: Record<string, string> }[];
  format: { duration: string; tags?: Record<string, string> };
};

/** What ffprobe says about a video's bytes. */
export async function probeBytes(data: Buffer): Promise<ProbeResult> {
  const folder = await mkdtemp(join(tmpdir(), "fw-test-probe-"));
  try {
    const file = join(folder, "probe.mp4");
    await writeFile(file, data);
    const out = await runTool(env.FFPROBE_PATH ?? "ffprobe", [
      "-v", "error", "-print_format", "json", "-show_format", "-show_streams", file,
    ]);
    return JSON.parse(out) as ProbeResult;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** Posts a video (and, as a Live Photo, the still that goes with it). Returns the pending request. */
export function postVideo(
  agent: Agent,
  groupId: string,
  video: Buffer,
  fields: Record<string, string> = {},
  still?: Buffer,
  filename = "clip.mp4",
) {
  const req = agent.post(`/api/groups/${groupId}/photos`);
  for (const [name, value] of Object.entries(fields)) req.field(name, value);
  if (still) req.attach("photo", still, { filename: "still.jpg", contentType: "image/jpeg" });
  req.attach("video", video, { filename, contentType: "video/mp4" });
  return req;
}

/** Posts a small video and returns it as the API presents it. */
export async function uploadVideo(agent: Agent, groupId: string, video?: Buffer, fields: Record<string, string> = {}) {
  const res = await postVideo(agent, groupId, video ?? (await makeVideo()), fields);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.photo as PhotoBody;
}

import type { Express } from "express";
import sharp from "sharp";
import request, { type Response } from "supertest";
import { expect } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { deletePrefix } from "../src/lib/storage.js";

/** Deletes all rows, children before parents. */
export async function resetDatabase(): Promise<void> {
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
  username: "alice",
  displayName: "Alice",
  password: "correct horse battery staple",
};

export type TestUser = { id: string; username: string; displayName: string };

/** Registers `username` and returns a cookie-keeping agent signed in as them (a "browser"). */
export async function signUp(app: Express, username: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({
    username,
    displayName: username[0]!.toUpperCase() + username.slice(1),
    password: testUser.password,
  });
  if (res.status !== 201) throw new Error(`signUp(${username}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user as TestUser };
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
  caption: string | null;
  width: number;
  height: number;
  imageUrls: { full: string; medium: string; thumbnail: string };
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

import type { ReactionType } from "../../generated/prisma/client.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { notBlockedWith } from "../blocks/blocks.repository.js";
import { reactionEntrySelect, type Reactor } from "./reaction.dto.js";

/** Adds the person's reaction, or changes it: there's at most one per person per photo. */
export function upsertReaction(photoId: string, userId: string, type: ReactionType, db: DbClient = prisma) {
  return db.reaction.upsert({
    where: { photoId_userId: { photoId, userId } },
    create: { photoId, userId, type },
    update: { type },
  });
}

/** deleteMany so removing a reaction that isn't there is a no-op. */
export function deleteReaction(photoId: string, userId: string, db: DbClient = prisma) {
  return db.reaction.deleteMany({ where: { photoId, userId } });
}

export async function findReactionType(photoId: string, userId: string, db: DbClient = prisma) {
  const reaction = await db.reaction.findUnique({
    where: { photoId_userId: { photoId, userId } },
    select: { type: true },
  });
  return reaction?.type ?? null;
}

/**
 * Everyone who reacted to each photo, first reaction first, in one query on the indexed
 * photo_id (photos without reactions are absent). At most one row per member per photo, so
 * a page of photos stays small. People with a block between them and the viewer are left out.
 */
export async function listReactorsByPhoto(
  photoIds: string[],
  viewerId: string,
  db: DbClient = prisma,
): Promise<Map<string, Reactor[]>> {
  const reactors = new Map<string, Reactor[]>();
  if (photoIds.length === 0) return reactors;

  const rows = await db.reaction.findMany({
    where: { photoId: { in: photoIds }, user: notBlockedWith(viewerId) },
    orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    select: { photoId: true, userId: true, type: true },
  });
  for (const { photoId, userId, type } of rows) {
    const list = reactors.get(photoId) ?? [];
    list.push({ userId, type });
    reactors.set(photoId, list);
  }
  return reactors;
}

/** Everyone who reacted to a photo, first reaction first, as the viewer may see them. */
export function listReactions(photoId: string, viewerId: string, db: DbClient = prisma) {
  return db.reaction.findMany({
    where: { photoId, user: notBlockedWith(viewerId) },
    orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    select: reactionEntrySelect,
  });
}

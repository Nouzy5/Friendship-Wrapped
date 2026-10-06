import type { ReactionType } from "../../generated/prisma/client.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { emptyCounts, reactionEntrySelect, type ReactionCounts } from "./reaction.dto.js";

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

/** Counts per type for each photo, in one grouped query (photos without reactions are absent). */
export async function countByPhoto(photoIds: string[], db: DbClient = prisma): Promise<Map<string, ReactionCounts>> {
  const counts = new Map<string, ReactionCounts>();
  if (photoIds.length === 0) return counts;

  const rows = await db.reaction.groupBy({
    by: ["photoId", "type"],
    where: { photoId: { in: photoIds } },
    _count: { _all: true },
  });
  for (const row of rows) {
    const photoCounts = counts.get(row.photoId) ?? emptyCounts();
    photoCounts[row.type] = row._count._all;
    counts.set(row.photoId, photoCounts);
  }
  return counts;
}

/** Everyone who reacted to a photo, first reaction first. At most one per person, so it stays small. */
export function listReactions(photoId: string, db: DbClient = prisma) {
  return db.reaction.findMany({
    where: { photoId },
    orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    select: reactionEntrySelect,
  });
}

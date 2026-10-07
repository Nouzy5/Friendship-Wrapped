import type { Prisma } from "../../generated/prisma/client.js";
import { prisma, type DbClient } from "../../lib/prisma.js";

export type WrappedKey = { groupId: string; year: number; timeZone: string };

export function findWrapped(key: WrappedKey, db: DbClient = prisma) {
  return db.wrapped.findUnique({
    where: { groupId_year_timeZone: key },
    select: { stats: true, generatedAt: true },
  });
}

/** Saves a finished year's Wrapped (replacing one saved in an older format). */
export function saveWrapped(key: WrappedKey, stats: Prisma.InputJsonValue, generatedAt: Date, db: DbClient = prisma) {
  return db.wrapped.upsert({
    where: { groupId_year_timeZone: key },
    create: { ...key, stats, generatedAt },
    update: { stats, generatedAt },
  });
}

/**
 * When each group's first and last photos were posted (groups without photos are absent).
 * MIN and MAX per group come straight off the (group_id, created_at, id) index.
 */
export async function findPhotoSpans(groupIds: string[], db: DbClient = prisma) {
  if (groupIds.length === 0) return [];
  const rows = await db.photo.groupBy({
    by: ["groupId"],
    where: { groupId: { in: groupIds } },
    _min: { createdAt: true },
    _max: { createdAt: true },
  });
  return rows.map((row) => ({ groupId: row.groupId, first: row._min.createdAt!, last: row._max.createdAt! }));
}

export async function hasPhotosBetween(groupId: string, { from, to }: { from: Date; to: Date }, db: DbClient = prisma) {
  const photo = await db.photo.findFirst({
    where: { groupId, createdAt: { gte: from, lt: to } },
    select: { id: true },
  });
  return photo !== null;
}

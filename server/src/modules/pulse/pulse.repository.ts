import { prisma, type DbClient } from "../../lib/prisma.js";

/** A span of time: from (inclusive) to (exclusive). */
export type Range = { from: Date; to: Date };

type CountRow = { n: bigint | number };

/** Photos posted in the group during the range. */
export function countPhotos(groupId: string, { from, to }: Range, db: DbClient = prisma) {
  return db.photo.count({ where: { groupId, createdAt: { gte: from, lt: to } } });
}

/** Reactions given during the range on the group's photos (whenever those were posted). */
export async function countReactions(groupId: string, { from, to }: Range, db: DbClient = prisma): Promise<number> {
  const [row] = await db.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS n
    FROM reactions r JOIN photos p ON p.id = r.photo_id
    WHERE p.group_id = ${groupId} AND r.created_at >= ${from} AND r.created_at < ${to}`;
  return Number(row?.n ?? 0);
}

/** Comments written during the range on the group's photos (whenever those were posted). */
export async function countComments(groupId: string, { from, to }: Range, db: DbClient = prisma): Promise<number> {
  const [row] = await db.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS n
    FROM comments c JOIN photos p ON p.id = c.photo_id
    WHERE p.group_id = ${groupId} AND c.created_at >= ${from} AND c.created_at < ${to}`;
  return Number(row?.n ?? 0);
}

/** Whether anyone in the group posted a photo during the range: one lookup on the (group, time) index. */
export async function hasPhoto(groupId: string, { from, to }: Range, db: DbClient = prisma): Promise<boolean> {
  const photo = await db.photo.findFirst({
    where: { groupId, createdAt: { gte: from, lt: to } },
    select: { id: true },
  });
  return photo !== null;
}

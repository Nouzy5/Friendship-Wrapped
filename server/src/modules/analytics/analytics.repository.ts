import { prisma, type DbClient } from "../../lib/prisma.js";

/** A span of time: from (inclusive) to (exclusive). */
export type Range = { from: Date; to: Date };

type CountRow = { id: string; n: bigint | number };

const toMap = (rows: CountRow[]) => new Map(rows.map((row) => [row.id, Number(row.n)]));

/** Every photo posted in the group during the range, oldest first: for counting by person, month and day. */
export function listPhotoTimes(groupId: string, { from, to }: Range, db: DbClient = prisma) {
  return db.photo.findMany({
    where: { groupId, createdAt: { gte: from, lt: to } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, uploaderId: true, createdAt: true },
  });
}

/** Reactions given during the range on the group's photos (whenever those were posted), per person. */
export async function countReactionsByUser(groupId: string, { from, to }: Range, db: DbClient = prisma) {
  return toMap(
    await db.$queryRaw<CountRow[]>`
      SELECT r.user_id AS id, COUNT(*) AS n
      FROM reactions r JOIN photos p ON p.id = r.photo_id
      WHERE p.group_id = ${groupId} AND r.created_at >= ${from} AND r.created_at < ${to}
      GROUP BY r.user_id`,
  );
}

/** Comments written during the range on the group's photos (whenever those were posted), per person. */
export async function countCommentsByUser(groupId: string, { from, to }: Range, db: DbClient = prisma) {
  return toMap(
    await db.$queryRaw<CountRow[]>`
      SELECT c.author_id AS id, COUNT(*) AS n
      FROM comments c JOIN photos p ON p.id = c.photo_id
      WHERE p.group_id = ${groupId} AND c.created_at >= ${from} AND c.created_at < ${to}
      GROUP BY c.author_id`,
  );
}

/** All reactions on each photo posted during the range (photos without any are absent). */
export async function countReactionsByPhoto(groupId: string, { from, to }: Range, db: DbClient = prisma) {
  return toMap(
    await db.$queryRaw<CountRow[]>`
      SELECT r.photo_id AS id, COUNT(*) AS n
      FROM reactions r JOIN photos p ON p.id = r.photo_id
      WHERE p.group_id = ${groupId} AND p.created_at >= ${from} AND p.created_at < ${to}
      GROUP BY r.photo_id`,
  );
}

/** All comments on each photo posted during the range (photos without any are absent). */
export async function countCommentsByPhoto(groupId: string, { from, to }: Range, db: DbClient = prisma) {
  return toMap(
    await db.$queryRaw<CountRow[]>`
      SELECT c.photo_id AS id, COUNT(*) AS n
      FROM comments c JOIN photos p ON p.id = c.photo_id
      WHERE p.group_id = ${groupId} AND p.created_at >= ${from} AND p.created_at < ${to}
      GROUP BY c.photo_id`,
  );
}

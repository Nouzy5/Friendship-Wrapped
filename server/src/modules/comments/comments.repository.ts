import { after, type Cursor } from "../../lib/pagination.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { commentSelect } from "./comment.dto.js";

export function createComment(data: { photoId: string; authorId: string; body: string }, db: DbClient = prisma) {
  return db.comment.create({ data, select: commentSelect });
}

/** Oldest first, like a conversation; `take` is the page size plus one. */
export function listComments(photoId: string, page: { cursor?: Cursor; take: number }, db: DbClient = prisma) {
  const { cursor, take } = page;
  return db.comment.findMany({
    where: { photoId, ...(cursor && after(cursor)) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
    select: commentSelect,
  });
}

/**
 * Comment counts for a page of photos in one grouped query on the indexed photo_id
 * (photos without comments are absent). Prisma's relation `_count` aggregated the whole
 * table instead: ~35 ms at 20,000 comments, against ~1 ms for this.
 */
export async function countByPhoto(photoIds: string[], db: DbClient = prisma): Promise<Map<string, number>> {
  if (photoIds.length === 0) return new Map();
  const rows = await db.comment.groupBy({
    by: ["photoId"],
    where: { photoId: { in: photoIds } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.photoId, row._count._all]));
}

export function findComment(commentId: string, db: DbClient = prisma) {
  return db.comment.findUnique({ where: { id: commentId }, select: { authorId: true, photoId: true } });
}

/** deleteMany so a concurrent second delete is a no-op rather than an error. */
export function deleteComment(commentId: string, db: DbClient = prisma) {
  return db.comment.deleteMany({ where: { id: commentId } });
}

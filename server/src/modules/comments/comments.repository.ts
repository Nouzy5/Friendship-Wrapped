import { after, type Cursor } from "../../lib/pagination.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { notBlockedWith } from "../blocks/blocks.repository.js";
import { commentSelect } from "./comment.dto.js";

export function createComment(data: { photoId: string; authorId: string; body: string }, db: DbClient = prisma) {
  return db.comment.create({ data, select: commentSelect });
}

/**
 * Oldest first, like a conversation; `take` is the page size plus one. Comments by people
 * with a block between them and the viewer are left out.
 */
export function listComments(
  photoId: string,
  viewerId: string,
  page: { cursor?: Cursor; take: number },
  db: DbClient = prisma,
) {
  const { cursor, take } = page;
  return db.comment.findMany({
    where: { photoId, author: notBlockedWith(viewerId), ...(cursor && after(cursor)) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
    select: commentSelect,
  });
}

/**
 * Comment counts for a page of photos in one grouped query on the indexed photo_id
 * (photos without comments are absent), as the viewer sees them. Prisma's relation `_count`
 * aggregated the whole table instead: ~35 ms at 20,000 comments, against ~1 ms for this.
 */
export async function countByPhoto(
  photoIds: string[],
  viewerId: string,
  db: DbClient = prisma,
): Promise<Map<string, number>> {
  if (photoIds.length === 0) return new Map();
  const rows = await db.comment.groupBy({
    by: ["photoId"],
    where: { photoId: { in: photoIds }, author: notBlockedWith(viewerId) },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.photoId, row._count._all]));
}

/** Everyone who has commented on a photo (for notifying them of a new comment). */
export async function listCommenterIds(photoId: string, db: DbClient = prisma): Promise<string[]> {
  const rows = await db.comment.findMany({ where: { photoId }, distinct: ["authorId"], select: { authorId: true } });
  return rows.map((row) => row.authorId);
}

export function findComment(commentId: string, db: DbClient = prisma) {
  return db.comment.findUnique({ where: { id: commentId }, select: { authorId: true, photoId: true } });
}

/** deleteMany so a concurrent second delete is a no-op rather than an error. */
export function deleteComment(commentId: string, db: DbClient = prisma) {
  return db.comment.deleteMany({ where: { id: commentId } });
}

/** Everything someone wrote, on any photo (for deleting their account). */
export function deleteCommentsByAuthor(authorId: string, db: DbClient = prisma) {
  return db.comment.deleteMany({ where: { authorId } });
}

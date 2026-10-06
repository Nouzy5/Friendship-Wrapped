import type { Prisma } from "../../generated/prisma/client.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { photoDetailSelect, photoSelect } from "./photo.dto.js";
import type { PhotoCursor } from "./photos.schemas.js";

/**
 * Feed order is newest first, ties broken by id. These keyset conditions select the
 * photos before/after a position in that order, using the (group_id, created_at, id) index.
 */
function olderThan({ createdAt, id }: PhotoCursor): Prisma.PhotoWhereInput {
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}

function newerThan({ createdAt, id }: PhotoCursor): Prisma.PhotoWhereInput {
  return { OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: id } }] };
}

const newestFirst = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.PhotoOrderByWithRelationInput[];
const oldestFirst = [{ createdAt: "asc" }, { id: "asc" }] satisfies Prisma.PhotoOrderByWithRelationInput[];

export function createPhoto(data: Prisma.PhotoUncheckedCreateInput, db: DbClient = prisma) {
  return db.photo.create({ data, select: photoSelect });
}

/** Newest first; `take` is the page size (callers ask for one extra to detect a next page). */
export function listGroupPhotos(groupId: string, page: { cursor?: PhotoCursor; take: number }, db: DbClient = prisma) {
  const { cursor, take } = page;
  return db.photo.findMany({
    where: { groupId, ...(cursor && olderThan(cursor)) },
    orderBy: newestFirst,
    take,
    select: photoSelect,
  });
}

/** The ids of the photos just before and after this one in its group's feed (null at either end). */
export async function findFeedNeighbors(
  photo: PhotoCursor & { groupId: string },
  db: DbClient = prisma,
): Promise<{ newerId: string | null; olderId: string | null }> {
  const [newer, older] = await Promise.all([
    db.photo.findFirst({
      where: { groupId: photo.groupId, ...newerThan(photo) },
      orderBy: oldestFirst,
      select: { id: true },
    }),
    db.photo.findFirst({
      where: { groupId: photo.groupId, ...olderThan(photo) },
      orderBy: newestFirst,
      select: { id: true },
    }),
  ]);
  return { newerId: newer?.id ?? null, olderId: older?.id ?? null };
}

/** The privacy rule in one place: a photo is visible to its uploader and to members of its group. */
function visibleTo(photoId: string, viewerId: string): Prisma.PhotoWhereInput {
  return {
    id: photoId,
    OR: [{ uploaderId: viewerId }, { group: { members: { some: { userId: viewerId } } } }],
  };
}

export function findVisiblePhoto(photoId: string, viewerId: string, db: DbClient = prisma) {
  return db.photo.findFirst({ where: visibleTo(photoId, viewerId), select: photoDetailSelect });
}

export function findVisiblePhotoKeys(photoId: string, viewerId: string, db: DbClient = prisma) {
  return db.photo.findFirst({
    where: visibleTo(photoId, viewerId),
    select: { uploaderId: true, storageKey: true, mediumKey: true, thumbnailKey: true },
  });
}

/** deleteMany so a concurrent second delete is a no-op rather than an error. */
export function deletePhoto(photoId: string, db: DbClient = prisma) {
  return db.photo.deleteMany({ where: { id: photoId } });
}

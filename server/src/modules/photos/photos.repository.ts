import type { Prisma } from "../../generated/prisma/client.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { photoDetailSelect, photoSelect } from "./photo.dto.js";
import type { PhotoCursor } from "./photos.schemas.js";

export function createPhoto(data: Prisma.PhotoUncheckedCreateInput, db: DbClient = prisma) {
  return db.photo.create({ data, select: photoSelect });
}

/** Newest first; `take` is the page size (callers ask for one extra to detect a next page). */
export function listGroupPhotos(groupId: string, page: { cursor?: PhotoCursor; take: number }, db: DbClient = prisma) {
  const { cursor, take } = page;
  return db.photo.findMany({
    where: {
      groupId,
      ...(cursor && {
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: photoSelect,
  });
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

import type { Prisma } from "../../generated/prisma/client.js";
import { after, before, type Cursor } from "../../lib/pagination.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { photoDetailSelect, photoSelect } from "./photo.dto.js";

// Feed order is newest first, ties broken by id, using the (group_id, created_at, id) index.
const newestFirst = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.PhotoOrderByWithRelationInput[];
const oldestFirst = [{ createdAt: "asc" }, { id: "asc" }] satisfies Prisma.PhotoOrderByWithRelationInput[];

/** `viewerId` is the uploader, who is the only one looking at the result. */
export function createPhoto(data: Prisma.PhotoUncheckedCreateInput, db: DbClient = prisma) {
  return db.photo.create({ data, select: photoSelect(data.uploaderId) });
}

type GroupPhotosPage = {
  cursor?: Cursor;
  /** Where to start when there's no cursor yet (a timeline jumping to a month). */
  startBefore?: Date;
  /** Only photos the viewer has favorited. */
  onlyFavorites?: boolean;
  /** The page size; callers ask for one extra to detect a next page. */
  take: number;
};

/** Newest first. */
export function listGroupPhotos(
  groupId: string,
  viewerId: string,
  { cursor, startBefore, onlyFavorites, take }: GroupPhotosPage,
  db: DbClient = prisma,
) {
  return db.photo.findMany({
    where: {
      groupId,
      ...(cursor ? before(cursor) : startBefore && { createdAt: { lt: startBefore } }),
      ...(onlyFavorites && { favorites: { some: { userId: viewerId } } }),
    },
    orderBy: newestFirst,
    take,
    select: photoSelect(viewerId),
  });
}

/** An album's photos, oldest first, so it reads like the story of the event. */
export function listAlbumPhotos(
  albumId: string,
  viewerId: string,
  { cursor, take }: { cursor?: Cursor; take: number },
  db: DbClient = prisma,
) {
  return db.photo.findMany({
    where: { albums: { some: { albumId } }, ...(cursor && after(cursor)) },
    orderBy: oldestFirst,
    take,
    select: photoSelect(viewerId),
  });
}

/** Specific photos of a group, in no particular order. */
export function findGroupPhotosByIds(groupId: string, photoIds: string[], viewerId: string, db: DbClient = prisma) {
  return db.photo.findMany({ where: { groupId, id: { in: photoIds } }, select: photoSelect(viewerId) });
}

/** A group's photos posted within the time range, newest first. */
export function listPhotosInRange(
  groupId: string,
  viewerId: string,
  { from, to }: { from: Date; to: Date },
  take: number,
  db: DbClient = prisma,
) {
  return db.photo.findMany({
    where: { groupId, createdAt: { gte: from, lt: to } },
    orderBy: newestFirst,
    take,
    select: photoSelect(viewerId),
  });
}

/** The ids of the photos just before and after this one in its group's feed (null at either end). */
export async function findFeedNeighbors(
  photo: Cursor & { groupId: string },
  db: DbClient = prisma,
): Promise<{ newerId: string | null; olderId: string | null }> {
  const [newer, older] = await Promise.all([
    db.photo.findFirst({
      where: { groupId: photo.groupId, ...after(photo) },
      orderBy: oldestFirst,
      select: { id: true },
    }),
    db.photo.findFirst({
      where: { groupId: photo.groupId, ...before(photo) },
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
  return db.photo.findFirst({ where: visibleTo(photoId, viewerId), select: photoDetailSelect(viewerId) });
}

/** Just enough to check access, for features attached to a photo (reactions, comments, …). */
export function findVisiblePhotoRef(photoId: string, viewerId: string, db: DbClient = prisma) {
  return db.photo.findFirst({
    where: visibleTo(photoId, viewerId),
    select: { id: true, groupId: true, uploaderId: true },
  });
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

/** Every photo someone posted, in any group (for deleting their account). */
export function listPhotoKeysByUploader(uploaderId: string, db: DbClient = prisma) {
  return db.photo.findMany({
    where: { uploaderId },
    select: { storageKey: true, mediumKey: true, thumbnailKey: true },
  });
}

/** Their reactions, comments, favorites and album links go with them (ON DELETE CASCADE). */
export function deletePhotosByUploader(uploaderId: string, db: DbClient = prisma) {
  return db.photo.deleteMany({ where: { uploaderId } });
}

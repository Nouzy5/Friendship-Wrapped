import { Prisma } from "../../generated/prisma/client.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { albumSelect } from "./album.dto.js";

/** Newest albums first. */
export function listAlbums(groupId: string, db: DbClient = prisma) {
  return db.album.findMany({
    where: { groupId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: albumSelect,
  });
}

export function findAlbum(albumId: string, db: DbClient = prisma) {
  return db.album.findUnique({ where: { id: albumId }, select: albumSelect });
}

export function createAlbum(data: { groupId: string; createdById: string; name: string }, db: DbClient = prisma) {
  return db.album.create({ data, select: albumSelect });
}

export function renameAlbum(albumId: string, name: string, db: DbClient = prisma) {
  return db.album.update({ where: { id: albumId }, data: { name }, select: albumSelect });
}

/** The album's photos stay where they are; only the album and its links go. */
export function deleteAlbum(albumId: string, db: DbClient = prisma) {
  return db.album.deleteMany({ where: { id: albumId } });
}

/** Photo counts per album, in one grouped query (empty albums are absent). */
export async function countPhotos(albumIds: string[], db: DbClient = prisma): Promise<Map<string, number>> {
  if (albumIds.length === 0) return new Map();
  const rows = await db.photoAlbum.groupBy({
    by: ["albumId"],
    where: { albumId: { in: albumIds } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.albumId, row._count._all]));
}

/**
 * Each album's cover: the photo most recently added to it. One index lookup per album on
 * (album_id, added_at), however big the albums get. (Picking the newest photo by date
 * meant joining and sorting every photo in every album: ~26 ms for 20 albums of 100.)
 */
export async function findCoverPhotoIds(albumIds: string[], db: DbClient = prisma): Promise<Map<string, string>> {
  if (albumIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ album_id: string; photo_id: string | null }[]>`
    SELECT a.id AS album_id,
           (SELECT pa.photo_id FROM photo_albums pa
            WHERE pa.album_id = a.id
            ORDER BY pa.added_at DESC, pa.photo_id DESC
            LIMIT 1) AS photo_id
    FROM albums a
    WHERE a.id IN (${Prisma.join(albumIds)})`;
  return new Map(rows.flatMap((row) => (row.photo_id ? [[row.album_id, row.photo_id] as const] : [])));
}

/** How many of these photos belong to the group (to check them before adding). */
export function countPhotosInGroup(groupId: string, photoIds: string[], db: DbClient = prisma) {
  return db.photo.count({ where: { groupId, id: { in: photoIds } } });
}

/** Adding a photo that's already in the album is a no-op. */
export function addPhotos(albumId: string, photoIds: string[], db: DbClient = prisma) {
  return db.photoAlbum.createMany({
    data: photoIds.map((photoId) => ({ albumId, photoId })),
    skipDuplicates: true,
  });
}

export function removePhoto(albumId: string, photoId: string, db: DbClient = prisma) {
  return db.photoAlbum.deleteMany({ where: { albumId, photoId } });
}

export async function findAlbumIdsForPhoto(photoId: string, db: DbClient = prisma): Promise<string[]> {
  const rows = await db.photoAlbum.findMany({ where: { photoId }, select: { albumId: true } });
  return rows.map((row) => row.albumId);
}

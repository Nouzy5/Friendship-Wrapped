import type { GroupRole } from "../../generated/prisma/client.js";
import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import type { Cursor } from "../../lib/pagination.js";
import * as groupsRepository from "../groups/groups.repository.js";
import { requireMembership } from "../groups/groups.service.js";
import { listAlbumPhotos, requireMemberAccess } from "../photos/photos.service.js";
import { toAlbumView, type AlbumRow, type AlbumView } from "./album.dto.js";
import * as albumsRepository from "./albums.repository.js";

/**
 * Albums are shared by the whole group: any member can create one and add or remove
 * photos. Renaming and deleting are for the album's creator and the group owner.
 */
function canManage(album: AlbumRow, userId: string, role: GroupRole): boolean {
  return album.createdById === userId || role === "OWNER";
}

async function toViews(albums: AlbumRow[], userId: string, role: GroupRole): Promise<AlbumView[]> {
  const ids = albums.map((album) => album.id);
  const [counts, covers] = await Promise.all([
    albumsRepository.countPhotos(ids, userId),
    albumsRepository.findCoverPhotoIds(ids, userId),
  ]);
  return albums.map((album) =>
    toAlbumView(album, {
      photoCount: counts.get(album.id) ?? 0,
      coverPhotoId: covers.get(album.id),
      canManage: canManage(album, userId, role),
    }),
  );
}

/** The album and the user's role in its group. Non-members get 404, like for groups. */
async function requireAlbum(albumId: string, userId: string) {
  const album = await albumsRepository.findAlbum(albumId);
  const membership = album && (await groupsRepository.findMembership(album.groupId, userId));
  if (!album || !membership) throw notFound("Album not found");
  return { album, role: membership.role };
}

async function viewOf(album: AlbumRow, userId: string, role: GroupRole): Promise<AlbumView> {
  const [view] = await toViews([album], userId, role);
  return view!;
}

export async function listAlbums(groupId: string, userId: string): Promise<AlbumView[]> {
  const { role } = await requireMembership(groupId, userId);
  return toViews(await albumsRepository.listAlbums(groupId), userId, role);
}

export async function createAlbum(groupId: string, userId: string, name: string): Promise<AlbumView> {
  const { role } = await requireMembership(groupId, userId);
  const album = await albumsRepository.createAlbum({ groupId, createdById: userId, name });
  return viewOf(album, userId, role);
}

export async function getAlbum(albumId: string, userId: string): Promise<AlbumView> {
  const { album, role } = await requireAlbum(albumId, userId);
  return viewOf(album, userId, role);
}

export async function renameAlbum(albumId: string, userId: string, name: string): Promise<AlbumView> {
  const { album, role } = await requireAlbum(albumId, userId);
  if (!canManage(album, userId, role)) throw forbidden("Only the album's creator or the group owner can rename it");
  return viewOf(await albumsRepository.renameAlbum(albumId, name), userId, role);
}

export async function deleteAlbum(albumId: string, userId: string): Promise<void> {
  const { album, role } = await requireAlbum(albumId, userId);
  if (!canManage(album, userId, role)) throw forbidden("Only the album's creator or the group owner can delete it");
  await albumsRepository.deleteAlbum(albumId);
}

export async function listPhotos(albumId: string, userId: string, page: { cursor?: Cursor; limit: number }) {
  await requireAlbum(albumId, userId);
  return listAlbumPhotos(albumId, userId, page);
}

/** Only photos from the album's own group can go in it. */
export async function addPhotos(albumId: string, userId: string, photoIds: string[]): Promise<AlbumView> {
  const { album, role } = await requireAlbum(albumId, userId);
  const inGroup = await albumsRepository.countPhotosInGroup(album.groupId, photoIds);
  if (inGroup !== photoIds.length) throw badRequest("Only photos from this group can go in its albums");

  await albumsRepository.addPhotos(albumId, photoIds);
  return viewOf(album, userId, role);
}

export async function removePhoto(albumId: string, userId: string, photoId: string): Promise<AlbumView> {
  const { album, role } = await requireAlbum(albumId, userId);
  await albumsRepository.removePhoto(albumId, photoId);
  return viewOf(album, userId, role);
}

/** Which of the group's albums a photo is in, for the viewer's album picker. */
export async function albumIdsForPhoto(photoId: string, userId: string): Promise<string[]> {
  await requireMemberAccess(photoId, userId);
  return albumsRepository.findAlbumIdsForPhoto(photoId);
}

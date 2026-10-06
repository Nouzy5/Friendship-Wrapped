import { apiRequest } from "../../lib/api-client";
import type { PhotoPage } from "../photos/types";
import type { Album } from "./types";

const albumPath = (albumId: string) => `/albums/${encodeURIComponent(albumId)}`;
const groupAlbumsPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/albums`;

export async function fetchAlbums(groupId: string, signal?: AbortSignal): Promise<Album[]> {
  const { albums } = await apiRequest<{ albums: Album[] }>(groupAlbumsPath(groupId), { signal });
  return albums;
}

export async function fetchAlbum(albumId: string, signal?: AbortSignal): Promise<Album> {
  const { album } = await apiRequest<{ album: Album }>(albumPath(albumId), { signal });
  return album;
}

/** One page of an album's photos, oldest first. */
export function fetchAlbumPhotos(albumId: string, cursor: string | null, signal?: AbortSignal): Promise<PhotoPage> {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  return apiRequest<PhotoPage>(`${albumPath(albumId)}/photos${query}`, { signal });
}

export async function createAlbum(groupId: string, name: string): Promise<Album> {
  const { album } = await apiRequest<{ album: Album }>(groupAlbumsPath(groupId), { method: "POST", body: { name } });
  return album;
}

export async function renameAlbum(albumId: string, name: string): Promise<Album> {
  const { album } = await apiRequest<{ album: Album }>(albumPath(albumId), { method: "PATCH", body: { name } });
  return album;
}

export async function deleteAlbum(albumId: string): Promise<void> {
  await apiRequest<null>(albumPath(albumId), { method: "DELETE" });
}

export async function addAlbumPhotos(albumId: string, photoIds: string[]): Promise<Album> {
  const { album } = await apiRequest<{ album: Album }>(`${albumPath(albumId)}/photos`, {
    method: "POST",
    body: { photoIds },
  });
  return album;
}

export async function removeAlbumPhoto(albumId: string, photoId: string): Promise<Album> {
  const { album } = await apiRequest<{ album: Album }>(
    `${albumPath(albumId)}/photos/${encodeURIComponent(photoId)}`,
    { method: "DELETE" },
  );
  return album;
}

/** Which albums a photo is in. */
export async function fetchPhotoAlbumIds(photoId: string, signal?: AbortSignal): Promise<string[]> {
  const { albumIds } = await apiRequest<{ albumIds: string[] }>(`/photos/${encodeURIComponent(photoId)}/albums`, {
    signal,
  });
  return albumIds;
}

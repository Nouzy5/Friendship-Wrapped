import { apiRequest, apiUpload } from "../../lib/api-client";
import { getDeviceSettings } from "../../lib/device-settings";
import { shrinkForUpload } from "../../lib/shrink-image";
import type { NewPhoto, Photo, PhotoDetail, PhotoPage } from "./types";

const photoPath = (photoId: string) => `/photos/${encodeURIComponent(photoId)}`;
const groupPhotosPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/photos`;

/** Which of a group's photos to list (all of them by default). */
export type GroupPhotosFilter = {
  /** Start from photos posted before this ISO instant (the timeline jumping to a month). */
  before?: string;
  /** Only your favorites. */
  favorites?: boolean;
  /** Only photos this person posted. */
  uploaderId?: string;
};

/** One page of a group's photos, newest first. Pass the previous page's `nextCursor` to continue. */
export function fetchGroupPhotos(
  groupId: string,
  page: { cursor: string | null; limit: number } & GroupPhotosFilter,
  signal?: AbortSignal,
): Promise<PhotoPage> {
  const query = new URLSearchParams({ limit: String(page.limit) });
  if (page.cursor) query.set("cursor", page.cursor);
  if (page.before) query.set("before", page.before);
  if (page.favorites) query.set("favorites", "true");
  if (page.uploaderId) query.set("uploaderId", page.uploaderId);
  return apiRequest<PhotoPage>(`${groupPhotosPath(groupId)}?${query}`, { signal });
}

export async function fetchPhoto(photoId: string, signal?: AbortSignal): Promise<PhotoDetail> {
  const { photo } = await apiRequest<{ photo: PhotoDetail }>(photoPath(photoId), { signal });
  return photo;
}

/** Big photos are scaled down on the device first (see shrinkForUpload). */
export async function uploadPhoto({ groupId, image, caption, onProgress }: NewPhoto): Promise<Photo> {
  const form = new FormData();
  form.append("caption", caption);
  form.append("photo", await shrinkForUpload(image, getDeviceSettings().photoQuality), "photo.jpg");
  const { photo } = await apiUpload<{ photo: Photo }>(groupPhotosPath(groupId), form, onProgress);
  return photo;
}

export async function deletePhoto(photoId: string): Promise<void> {
  await apiRequest<null>(photoPath(photoId), { method: "DELETE" });
}

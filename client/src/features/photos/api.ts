import { apiRequest } from "../../lib/api-client";
import type { NewPhoto, Photo, PhotoDetail, PhotoPage } from "./types";

const photoPath = (photoId: string) => `/photos/${encodeURIComponent(photoId)}`;
const groupPhotosPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/photos`;

export function fetchGroupPhotos(groupId: string, signal?: AbortSignal): Promise<PhotoPage> {
  return apiRequest<PhotoPage>(groupPhotosPath(groupId), { signal });
}

export async function fetchPhoto(photoId: string, signal?: AbortSignal): Promise<PhotoDetail> {
  const { photo } = await apiRequest<{ photo: PhotoDetail }>(photoPath(photoId), { signal });
  return photo;
}

export async function uploadPhoto({ groupId, image, caption }: NewPhoto): Promise<Photo> {
  const form = new FormData();
  form.append("caption", caption);
  form.append("photo", image, "photo.jpg");
  const { photo } = await apiRequest<{ photo: Photo }>(groupPhotosPath(groupId), { method: "POST", body: form });
  return photo;
}

export async function deletePhoto(photoId: string): Promise<void> {
  await apiRequest<null>(photoPath(photoId), { method: "DELETE" });
}

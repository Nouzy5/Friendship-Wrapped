import { apiRequest } from "../../lib/api-client";

export async function setFavorite(photoId: string, favorite: boolean): Promise<boolean> {
  const { isFavorite } = await apiRequest<{ isFavorite: boolean }>(
    `/photos/${encodeURIComponent(photoId)}/favorite`,
    { method: favorite ? "PUT" : "DELETE" },
  );
  return isFavorite;
}

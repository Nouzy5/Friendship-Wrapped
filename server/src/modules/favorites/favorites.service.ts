import { requireVisiblePhoto } from "../photos/photos.service.js";
import * as favoritesRepository from "./favorites.repository.js";

/** Favorites are private bookmarks, so any photo you can see can be one. */
export async function addFavorite(photoId: string, userId: string): Promise<void> {
  await requireVisiblePhoto(photoId, userId);
  await favoritesRepository.addFavorite(userId, photoId);
}

/** Always allowed: it only ever touches your own favorites, even for a photo you can no longer see. */
export async function removeFavorite(photoId: string, userId: string): Promise<void> {
  await favoritesRepository.removeFavorite(userId, photoId);
}

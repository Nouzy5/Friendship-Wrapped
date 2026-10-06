import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { photoParamsSchema } from "../photos/photos.schemas.js";
import * as favoritesService from "./favorites.service.js";

/** PUT /photos/:photoId/favorite */
export const addFavorite: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  await favoritesService.addFavorite(photoId, currentUser(req).id);
  res.json({ isFavorite: true });
};

/** DELETE /photos/:photoId/favorite */
export const removeFavorite: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  await favoritesService.removeFavorite(photoId, currentUser(req).id);
  res.json({ isFavorite: false });
};

import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  addAlbumPhotos,
  deleteAlbum,
  getAlbum,
  listAlbumPhotos,
  removeAlbumPhoto,
  renameAlbum,
} from "./albums.controller.js";

/** Albums are listed and created under their group (groups.routes); this is for acting on one. */
export const albumsRouter = Router();

albumsRouter.use(requireAuth);

albumsRouter.get("/:albumId", getAlbum);
albumsRouter.patch("/:albumId", renameAlbum);
albumsRouter.delete("/:albumId", deleteAlbum);
albumsRouter.get("/:albumId/photos", listAlbumPhotos);
albumsRouter.post("/:albumId/photos", addAlbumPhotos);
albumsRouter.delete("/:albumId/photos/:photoId", removeAlbumPhoto);

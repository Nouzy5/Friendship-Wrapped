import { Router } from "express";
import { listPhotoAlbumIds } from "../albums/albums.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { addComment, listComments } from "../comments/comments.controller.js";
import { addFavorite, removeFavorite } from "../favorites/favorites.controller.js";
import { listReactions, removeReaction, setReaction } from "../reactions/reactions.controller.js";
import { deletePhoto, getPhoto, getPhotoImage } from "./photos.controller.js";

export const photosRouter = Router();

photosRouter.use(requireAuth);

photosRouter.get("/:photoId", getPhoto);
photosRouter.get("/:photoId/images/:variant", getPhotoImage);
photosRouter.delete("/:photoId", deletePhoto);

photosRouter.get("/:photoId/reactions", listReactions);
photosRouter.put("/:photoId/reaction", setReaction);
photosRouter.delete("/:photoId/reaction", removeReaction);

photosRouter.get("/:photoId/comments", listComments);
photosRouter.post("/:photoId/comments", addComment);

photosRouter.put("/:photoId/favorite", addFavorite);
photosRouter.delete("/:photoId/favorite", removeFavorite);

photosRouter.get("/:photoId/albums", listPhotoAlbumIds);

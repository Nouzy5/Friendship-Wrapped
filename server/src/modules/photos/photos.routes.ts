import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { deletePhoto, getPhoto, getPhotoImage } from "./photos.controller.js";

export const photosRouter = Router();

photosRouter.use(requireAuth);

photosRouter.get("/:photoId", getPhoto);
photosRouter.get("/:photoId/images/:variant", getPhotoImage);
photosRouter.delete("/:photoId", deletePhoto);

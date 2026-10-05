import type { RequestHandler } from "express";
import { sendImage } from "../../lib/send-image.js";
import { readImageUpload } from "../../lib/upload.js";
import { currentUser } from "../auth/auth.middleware.js";
import { groupParamsSchema } from "../groups/groups.schemas.js";
import {
  createPhotoSchema,
  listPhotosQuerySchema,
  photoImageParamsSchema,
  photoParamsSchema,
} from "./photos.schemas.js";
import * as photosService from "./photos.service.js";

/** POST /groups/:groupId/photos — multipart: `photo` (file) and optional `caption`. */
export const uploadPhoto: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const userId = currentUser(req).id;

  await photosService.assertCanPost(groupId, userId);
  const { file, fields } = await readImageUpload(req, res, "photo");
  const { caption } = createPhotoSchema.parse(fields);

  const photo = await photosService.createPhoto(groupId, userId, file, caption ?? null);
  res.status(201).json({ photo });
};

export const listGroupPhotos: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const query = listPhotosQuerySchema.parse(req.query);
  const page = await photosService.listGroupPhotos(groupId, currentUser(req).id, query);
  res.json(page);
};

export const getPhoto: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  const photo = await photosService.getPhoto(photoId, currentUser(req).id);
  res.json({ photo });
};

export const getPhotoImage: RequestHandler = async (req, res) => {
  const { photoId, variant } = photoImageParamsSchema.parse(req.params);
  const image = await photosService.getPhotoImage(photoId, currentUser(req).id, variant);
  await sendImage(res, image);
};

export const deletePhoto: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  await photosService.deletePhoto(photoId, currentUser(req).id);
  res.status(204).end();
};

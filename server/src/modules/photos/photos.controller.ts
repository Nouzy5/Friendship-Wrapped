import type { RequestHandler } from "express";
import { sendImage } from "../../lib/send-image.js";
import { sendUnsatisfiableRange, sendVideo } from "../../lib/send-video.js";
import { readMediaUpload } from "../../lib/upload.js";
import { currentUser } from "../auth/auth.middleware.js";
import { groupParamsSchema } from "../groups/groups.schemas.js";
import {
  createPhotoSchema,
  listPhotosQuerySchema,
  onThisDayQuerySchema,
  photoImageParamsSchema,
  photoImageQuerySchema,
  photoParamsSchema,
} from "./photos.schemas.js";
import * as photosService from "./photos.service.js";

/**
 * POST /groups/:groupId/photos — multipart: `photo` (an image) and/or `video` (a video; with a
 * `photo` it is that video's poster picture), optional `caption`, `momentId` and `live`.
 */
export const uploadPhoto: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const userId = currentUser(req).id;

  await photosService.assertCanPost(groupId, userId);
  const upload = await readMediaUpload(req, res);
  try {
    const { caption, momentId, live } = createPhotoSchema.parse(upload.fields);
    const video = upload.video && { ...upload.video, isLive: live ?? false };
    const photo = await photosService.createPhoto(groupId, userId, upload.photo, caption ?? null, momentId ?? null, video);
    res.status(201).json({ photo });
  } finally {
    await upload.discard();
  }
};

export const listGroupPhotos: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const query = listPhotosQuerySchema.parse(req.query);
  const page = await photosService.listGroupPhotos(groupId, currentUser(req).id, query);
  res.json(page);
};

/** GET /groups/:groupId/photos/on-this-day?tz=…&date=… */
export const listOnThisDay: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const query = onThisDayQuerySchema.parse(req.query);
  res.json(await photosService.listOnThisDay(groupId, currentUser(req).id, query));
};

export const getPhoto: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  const photo = await photosService.getPhoto(photoId, currentUser(req).id);
  res.json({ photo });
};

/** GET /photos/:photoId/images/:variant — `?download=1` as an attachment, if the viewer may save it. */
export const getPhotoImage: RequestHandler = async (req, res) => {
  const { photoId, variant } = photoImageParamsSchema.parse(req.params);
  const { download } = photoImageQuerySchema.parse(req.query);
  const { image, downloadName } = await photosService.getPhotoImage(photoId, currentUser(req).id, variant, {
    download: download ?? false,
  });
  await sendImage(res, image, { downloadName });
};

export const deletePhoto: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  await photosService.deletePhoto(photoId, currentUser(req).id);
  res.status(204).end();
};

/**
 * GET /photos/:photoId/video — a video post's MP4, in pieces if asked (`Range`), so players start
 * at once and can seek. `?download=1` as an attachment, if the viewer may save it.
 */
export const getPhotoVideo: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  const { download } = photoImageQuerySchema.parse(req.query);
  const result = await photosService.getPhotoVideo(photoId, currentUser(req).id, {
    rangeHeader: req.headers.range,
    download: download ?? false,
  });
  if (result.unsatisfiable) {
    sendUnsatisfiableRange(res, result.size);
    return;
  }
  await sendVideo(res, result.video, { size: result.size, range: result.range, downloadName: result.downloadName });
};

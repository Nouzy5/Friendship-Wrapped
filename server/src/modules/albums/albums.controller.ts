import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { groupParamsSchema } from "../groups/groups.schemas.js";
import { photoParamsSchema } from "../photos/photos.schemas.js";
import {
  addAlbumPhotosSchema,
  albumInputSchema,
  albumParamsSchema,
  albumPhotoParamsSchema,
  listAlbumPhotosQuerySchema,
} from "./albums.schemas.js";
import * as albumsService from "./albums.service.js";

/** GET /groups/:groupId/albums */
export const listAlbums: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  res.json({ albums: await albumsService.listAlbums(groupId, currentUser(req).id) });
};

/** POST /groups/:groupId/albums — `{ name }` */
export const createAlbum: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const { name } = albumInputSchema.parse(req.body);
  res.status(201).json({ album: await albumsService.createAlbum(groupId, currentUser(req).id, name) });
};

export const getAlbum: RequestHandler = async (req, res) => {
  const { albumId } = albumParamsSchema.parse(req.params);
  res.json({ album: await albumsService.getAlbum(albumId, currentUser(req).id) });
};

/** PATCH /albums/:albumId — `{ name }` */
export const renameAlbum: RequestHandler = async (req, res) => {
  const { albumId } = albumParamsSchema.parse(req.params);
  const { name } = albumInputSchema.parse(req.body);
  res.json({ album: await albumsService.renameAlbum(albumId, currentUser(req).id, name) });
};

export const deleteAlbum: RequestHandler = async (req, res) => {
  const { albumId } = albumParamsSchema.parse(req.params);
  await albumsService.deleteAlbum(albumId, currentUser(req).id);
  res.status(204).end();
};

/** GET /albums/:albumId/photos — oldest first, `{ photos, nextCursor }`. */
export const listAlbumPhotos: RequestHandler = async (req, res) => {
  const { albumId } = albumParamsSchema.parse(req.params);
  const query = listAlbumPhotosQuerySchema.parse(req.query);
  res.json(await albumsService.listPhotos(albumId, currentUser(req).id, query));
};

/** POST /albums/:albumId/photos — `{ photoIds }` */
export const addAlbumPhotos: RequestHandler = async (req, res) => {
  const { albumId } = albumParamsSchema.parse(req.params);
  const { photoIds } = addAlbumPhotosSchema.parse(req.body);
  res.json({ album: await albumsService.addPhotos(albumId, currentUser(req).id, photoIds) });
};

/** DELETE /albums/:albumId/photos/:photoId */
export const removeAlbumPhoto: RequestHandler = async (req, res) => {
  const { albumId, photoId } = albumPhotoParamsSchema.parse(req.params);
  res.json({ album: await albumsService.removePhoto(albumId, currentUser(req).id, photoId) });
};

/** GET /photos/:photoId/albums — `{ albumIds }` */
export const listPhotoAlbumIds: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  res.json({ albumIds: await albumsService.albumIdsForPhoto(photoId, currentUser(req).id) });
};

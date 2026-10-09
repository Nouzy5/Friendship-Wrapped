import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { groupParamsSchema } from "../groups/groups.schemas.js";
import {
  createMomentSchema,
  listMomentPhotosQuerySchema,
  listMomentsQuerySchema,
  momentParamsSchema,
} from "./moments.schemas.js";
import * as momentsService from "./moments.service.js";

/** GET /groups/:groupId/moments — newest first, `{ moments, nextCursor }`. */
export const listMoments: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const query = listMomentsQuerySchema.parse(req.query);
  res.json(await momentsService.listMoments(groupId, currentUser(req).id, query));
};

/** GET /groups/:groupId/moments/open — `{ moment }`, null when nothing is happening. */
export const getOpenMoment: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  res.json({ moment: await momentsService.getOpenMoment(groupId, currentUser(req).id) });
};

/** POST /groups/:groupId/moments — `{ title, emoji?, durationHours? }` */
export const createMoment: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const input = createMomentSchema.parse(req.body);
  res.status(201).json({ moment: await momentsService.createMoment(groupId, currentUser(req).id, input) });
};

export const getMoment: RequestHandler = async (req, res) => {
  const { momentId } = momentParamsSchema.parse(req.params);
  res.json({ moment: await momentsService.getMoment(momentId, currentUser(req).id) });
};

/** POST /moments/:momentId/end */
export const endMoment: RequestHandler = async (req, res) => {
  const { momentId } = momentParamsSchema.parse(req.params);
  res.json({ moment: await momentsService.endMoment(momentId, currentUser(req).id) });
};

export const deleteMoment: RequestHandler = async (req, res) => {
  const { momentId } = momentParamsSchema.parse(req.params);
  await momentsService.deleteMoment(momentId, currentUser(req).id);
  res.status(204).end();
};

/** GET /moments/:momentId/photos — oldest first, `{ photos, nextCursor }`. */
export const listMomentPhotos: RequestHandler = async (req, res) => {
  const { momentId } = momentParamsSchema.parse(req.params);
  const query = listMomentPhotosQuerySchema.parse(req.query);
  res.json(await momentsService.listPhotos(momentId, currentUser(req).id, query));
};

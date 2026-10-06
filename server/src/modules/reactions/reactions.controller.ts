import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { photoParamsSchema } from "../photos/photos.schemas.js";
import { setReactionSchema } from "./reactions.schemas.js";
import * as reactionsService from "./reactions.service.js";

/** PUT /photos/:photoId/reaction — `{ type }` adds or changes your reaction. */
export const setReaction: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  const { type } = setReactionSchema.parse(req.body);
  const summary = await reactionsService.setReaction(photoId, currentUser(req).id, type);
  res.json({ summary });
};

/** DELETE /photos/:photoId/reaction */
export const removeReaction: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  const summary = await reactionsService.removeReaction(photoId, currentUser(req).id);
  res.json({ summary });
};

/** GET /photos/:photoId/reactions — who reacted, and how. */
export const listReactions: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  const reactions = await reactionsService.listReactions(photoId, currentUser(req).id);
  res.json({ reactions });
};

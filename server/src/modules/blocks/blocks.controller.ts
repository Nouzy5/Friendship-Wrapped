import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { userParamsSchema } from "../users/users.schemas.js";
import * as blocksService from "./blocks.service.js";

/** GET /users/me/blocks */
export const listBlocked: RequestHandler = async (req, res) => {
  res.json({ blocked: await blocksService.listBlocked(currentUser(req).id) });
};

/** PUT /users/me/blocks/:userId */
export const blockUser: RequestHandler = async (req, res) => {
  const { userId } = userParamsSchema.parse(req.params);
  await blocksService.block(currentUser(req).id, userId);
  res.status(204).end();
};

/** DELETE /users/me/blocks/:userId */
export const unblockUser: RequestHandler = async (req, res) => {
  const { userId } = userParamsSchema.parse(req.params);
  await blocksService.unblock(currentUser(req).id, userId);
  res.status(204).end();
};

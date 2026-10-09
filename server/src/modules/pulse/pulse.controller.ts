import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { groupParamsSchema } from "../groups/groups.schemas.js";
import { pulseQuerySchema } from "./pulse.schemas.js";
import * as pulseService from "./pulse.service.js";

/** GET /groups/:groupId/pulse?tz=… — this month in the group, and its weekly streak. */
export const getPulse: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const { tz } = pulseQuerySchema.parse(req.query);
  res.json({ pulse: await pulseService.getPulse(groupId, currentUser(req).id, tz) });
};

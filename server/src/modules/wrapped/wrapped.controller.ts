import type { RequestHandler } from "express";
import { yearStatsParamsSchema, yearStatsQuerySchema } from "../analytics/analytics.schemas.js";
import { currentUser } from "../auth/auth.middleware.js";
import * as wrappedService from "./wrapped.service.js";

/** GET /wrapped?tz=… — every Wrapped you can open, newest year first. */
export const listWrapped: RequestHandler = async (req, res) => {
  const { tz } = yearStatsQuerySchema.parse(req.query);
  res.json({ wrapped: await wrappedService.listWrapped(currentUser(req).id, tz) });
};

/** GET /groups/:groupId/wrapped/:year?tz=… — the group's year as a story of slides. */
export const getWrapped: RequestHandler = async (req, res) => {
  const { groupId, year } = yearStatsParamsSchema.parse(req.params);
  const { tz } = yearStatsQuerySchema.parse(req.query);
  res.json({ wrapped: await wrappedService.getWrapped(groupId, currentUser(req).id, { year, tz }) });
};

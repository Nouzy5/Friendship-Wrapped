import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { yearStatsParamsSchema, yearStatsQuerySchema } from "./analytics.schemas.js";
import * as analyticsService from "./analytics.service.js";

/** GET /groups/:groupId/stats/:year?tz=… — the group's year in numbers, for Wrapped. */
export const getYearStats: RequestHandler = async (req, res) => {
  const { groupId, year } = yearStatsParamsSchema.parse(req.params);
  const { tz } = yearStatsQuerySchema.parse(req.query);
  res.json({ stats: await analyticsService.getYearStats(groupId, currentUser(req).id, { year, tz }) });
};

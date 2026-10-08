import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { createReportSchema } from "./reports.schemas.js";
import * as reportsService from "./reports.service.js";

/** POST /reports — `{ photoId?, userId?, message }` */
export const createReport: RequestHandler = async (req, res) => {
  const input = createReportSchema.parse(req.body);
  const report = await reportsService.createReport(currentUser(req).id, input);
  res.status(201).json({ report });
};

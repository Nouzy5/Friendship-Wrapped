import { Router } from "express";
import { rateLimit } from "../../middleware/rate-limit.js";
import { currentUser, requireAuth } from "../auth/auth.middleware.js";
import { createReport } from "./reports.controller.js";

// Plenty for real reports; stops one account flooding the table.
const reportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  key: (req) => currentUser(req).id,
  message: "Too many reports. Please try again later.",
});

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.post("/", reportRateLimit, createReport);

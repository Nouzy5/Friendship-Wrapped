import { Router } from "express";
import { healthRouter } from "../modules/health/health.routes.js";

/** Mounted at /api. Each feature module contributes its own router. */
export const apiRouter = Router();

apiRouter.use("/health", healthRouter);

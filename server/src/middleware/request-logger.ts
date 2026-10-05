import type { RequestHandler } from "express";
import { logger } from "../lib/logger.js";

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = performance.now();

  res.on("finish", () => {
    const ms = Math.round(performance.now() - start);
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });

  next();
};

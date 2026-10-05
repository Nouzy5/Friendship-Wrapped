import type { RequestHandler } from "express";
import { serviceUnavailable } from "../../lib/errors.js";
import { getHealthReport } from "./health.service.js";

export const getHealth: RequestHandler = async (_req, res) => {
  const report = await getHealthReport();

  if (report.checks.database.status !== "ok") {
    throw serviceUnavailable("DATABASE_UNAVAILABLE", "The database is unreachable");
  }
  if (report.checks.storage.status !== "ok") {
    throw serviceUnavailable("STORAGE_UNAVAILABLE", "Photo storage is unreachable");
  }

  res.json(report);
};

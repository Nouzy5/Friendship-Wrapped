import { notFound } from "../../lib/errors.js";
import { requireVisiblePhoto } from "../photos/photos.service.js";
import * as usersRepository from "../users/users.repository.js";
import * as reportsRepository from "./reports.repository.js";
import type { CreateReportInput } from "./reports.schemas.js";

/**
 * Stores a report for whoever runs the server to review; nothing else happens. A reported
 * photo must be one the reporter can see (404 otherwise), a reported person must exist.
 */
export async function createReport(
  reporterId: string,
  { photoId, userId, message }: CreateReportInput,
): Promise<{ id: string; createdAt: Date }> {
  if (photoId) await requireVisiblePhoto(photoId, reporterId);
  if (userId && (await usersRepository.findUserSummaries([userId])).length === 0) throw notFound("User not found");

  return reportsRepository.createReport({
    reporterId,
    photoId: photoId ?? null,
    reportedUserId: userId ?? null,
    message,
  });
}

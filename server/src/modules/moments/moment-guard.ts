import { AppError, badRequest, notFound } from "../../lib/errors.js";
import type { DbClient } from "../../lib/prisma.js";
import * as momentsRepository from "./moments.repository.js";

/**
 * The moment a photo is being posted into must be one of the group's and still open. Kept apart
 * from the moments service so posting a photo can use it without the two importing each other.
 */
export async function requireOpenMomentIn(groupId: string, momentId: string, db?: DbClient, now = new Date()): Promise<void> {
  const moment = await momentsRepository.findMoment(momentId, db);
  if (!moment) throw notFound("Moment not found");
  if (moment.groupId !== groupId) throw badRequest("That moment belongs to another group");
  if (moment.endsAt.getTime() <= now.getTime()) {
    throw new AppError(409, "MOMENT_ENDED", "That moment has ended", { momentId });
  }
}

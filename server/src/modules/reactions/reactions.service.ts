import type { ReactionType } from "../../generated/prisma/client.js";
import { requireMemberAccess, requireVisiblePhoto } from "../photos/photos.service.js";
import { toReactionEntry, toReactionSummary, type ReactionEntry, type ReactionSummary } from "./reaction.dto.js";
import * as reactionsRepository from "./reactions.repository.js";

async function summaryFor(photoId: string, viewerId: string): Promise<ReactionSummary> {
  const [counts, mine] = await Promise.all([
    reactionsRepository.countByPhoto([photoId]),
    reactionsRepository.findReactionType(photoId, viewerId),
  ]);
  return toReactionSummary(counts.get(photoId), mine);
}

/** Adds or changes the person's reaction. Only current members of the photo's group can react. */
export async function setReaction(photoId: string, userId: string, type: ReactionType): Promise<ReactionSummary> {
  await requireMemberAccess(photoId, userId);
  await reactionsRepository.upsertReaction(photoId, userId, type);
  return summaryFor(photoId, userId);
}

/** Removing your own reaction only needs the photo to be visible to you, even after leaving the group. */
export async function removeReaction(photoId: string, userId: string): Promise<ReactionSummary> {
  await requireVisiblePhoto(photoId, userId);
  await reactionsRepository.deleteReaction(photoId, userId);
  return summaryFor(photoId, userId);
}

export async function listReactions(photoId: string, viewerId: string): Promise<ReactionEntry[]> {
  await requireVisiblePhoto(photoId, viewerId);
  const rows = await reactionsRepository.listReactions(photoId);
  return rows.map(toReactionEntry);
}

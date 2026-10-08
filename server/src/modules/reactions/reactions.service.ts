import type { ReactionType } from "../../generated/prisma/client.js";
import * as notifications from "../notifications/notifications.service.js";
import { requireMemberAccess, requireVisiblePhoto } from "../photos/photos.service.js";
import { toReactionEntry, toReactionSummary, type ReactionEntry, type ReactionSummary } from "./reaction.dto.js";
import * as reactionsRepository from "./reactions.repository.js";

async function summaryFor(photoId: string, viewerId: string): Promise<ReactionSummary> {
  const [reactors, mine] = await Promise.all([
    reactionsRepository.listReactorsByPhoto([photoId], viewerId),
    reactionsRepository.findReactionType(photoId, viewerId),
  ]);
  return toReactionSummary(reactors.get(photoId), mine);
}

/**
 * Adds or changes the person's reaction. Only current members of the photo's group can
 * react. The uploader hears about a new or changed reaction (not about the same one again).
 */
export async function setReaction(photoId: string, userId: string, type: ReactionType): Promise<ReactionSummary> {
  const photo = await requireMemberAccess(photoId, userId);
  const previous = await reactionsRepository.findReactionType(photoId, userId);
  await reactionsRepository.upsertReaction(photoId, userId, type);
  if (previous !== type) notifications.reacted(photo, userId, type);
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
  const rows = await reactionsRepository.listReactions(photoId, viewerId);
  return rows.map(toReactionEntry);
}

import { apiRequest } from "../../lib/api-client";
import type { ReactionEntry, ReactionSummary, ReactionType } from "./types";

const reactionPath = (photoId: string) => `/photos/${encodeURIComponent(photoId)}/reaction`;

/** Adds your reaction, or changes it (there's one per person per photo). */
export async function setReaction(photoId: string, type: ReactionType): Promise<ReactionSummary> {
  const { summary } = await apiRequest<{ summary: ReactionSummary }>(reactionPath(photoId), {
    method: "PUT",
    body: { type },
  });
  return summary;
}

export async function removeReaction(photoId: string): Promise<ReactionSummary> {
  const { summary } = await apiRequest<{ summary: ReactionSummary }>(reactionPath(photoId), { method: "DELETE" });
  return summary;
}

export async function fetchReactions(photoId: string, signal?: AbortSignal): Promise<ReactionEntry[]> {
  const { reactions } = await apiRequest<{ reactions: ReactionEntry[] }>(
    `/photos/${encodeURIComponent(photoId)}/reactions`,
    { signal },
  );
  return reactions;
}

import type { UserSummary } from "../auth/types";

export type ReactionType = "HEART" | "LAUGH" | "SKULL" | "FIRE" | "CRY";

/** How a photo has been reacted to, as you see it. */
export type ReactionSummary = {
  /** Every type is present, zero included. */
  counts: Record<ReactionType, number>;
  total: number;
  /** Your own reaction. */
  mine: ReactionType | null;
  /** Who reacted with what, oldest first (one reaction per person). */
  reactors: { userId: string; type: ReactionType }[];
};

/** One person's reaction, for "who reacted". */
export type ReactionEntry = { user: UserSummary; type: ReactionType; createdAt: string };

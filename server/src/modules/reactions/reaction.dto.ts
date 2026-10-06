import { ReactionType, type Prisma } from "../../generated/prisma/client.js";
import { toUserSummary, userSummarySelect, type UserSummary } from "../users/user.dto.js";

export const REACTION_TYPES = Object.values(ReactionType);

export type ReactionCounts = Record<ReactionType, number>;

/** How a photo has been reacted to, as one viewer sees it. */
export type ReactionSummary = {
  /** Every type is present, zero included. */
  counts: ReactionCounts;
  total: number;
  /** The viewer's own reaction. */
  mine: ReactionType | null;
};

export function emptyCounts(): ReactionCounts {
  return Object.fromEntries(REACTION_TYPES.map((type) => [type, 0])) as ReactionCounts;
}

export function toReactionSummary(counts: ReactionCounts | undefined, mine: ReactionType | null): ReactionSummary {
  const all = counts ?? emptyCounts();
  return { counts: all, total: REACTION_TYPES.reduce((sum, type) => sum + all[type], 0), mine };
}

export const reactionEntrySelect = {
  type: true,
  createdAt: true,
  user: { select: userSummarySelect },
} satisfies Prisma.ReactionSelect;

type ReactionEntryRow = Prisma.ReactionGetPayload<{ select: typeof reactionEntrySelect }>;

/** One person's reaction, for "who reacted". */
export type ReactionEntry = { user: UserSummary; type: ReactionType; createdAt: Date };

export function toReactionEntry(row: ReactionEntryRow): ReactionEntry {
  return { user: toUserSummary(row.user), type: row.type, createdAt: row.createdAt };
}

import { ReactionType, type Prisma } from "../../generated/prisma/client.js";
import { toUserSummary, userSummarySelect, type UserSummary } from "../users/user.dto.js";

export const REACTION_TYPES = Object.values(ReactionType);

export type ReactionCounts = Record<ReactionType, number>;

/** Who reacted, and how: enough for clients to colour-code reactions by member. */
export type Reactor = { userId: string; type: ReactionType };

/**
 * How a photo has been reacted to, as one viewer sees it. Reactions from people the viewer
 * blocked, or who blocked them, are left out of everything here.
 */
export type ReactionSummary = {
  /** Every type is present, zero included. */
  counts: ReactionCounts;
  total: number;
  /** The viewer's own reaction. */
  mine: ReactionType | null;
  /** First reaction first. */
  reactors: Reactor[];
};

export function emptyCounts(): ReactionCounts {
  return Object.fromEntries(REACTION_TYPES.map((type) => [type, 0])) as ReactionCounts;
}

export function toReactionSummary(reactors: Reactor[] | undefined, mine: ReactionType | null): ReactionSummary {
  const counts = emptyCounts();
  for (const { type } of reactors ?? []) counts[type] += 1;
  return { counts, total: reactors?.length ?? 0, mine, reactors: reactors ?? [] };
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

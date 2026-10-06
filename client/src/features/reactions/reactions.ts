import type { ReactionSummary, ReactionType } from "./types";

/** The five reactions, in the order they're shown. */
export const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "HEART", emoji: "❤️", label: "Love" },
  { type: "LAUGH", emoji: "😂", label: "Laughing" },
  { type: "SKULL", emoji: "💀", label: "Dead" },
  { type: "FIRE", emoji: "🔥", label: "Fire" },
  { type: "CRY", emoji: "😭", label: "Crying" },
];

export const reactionByType = Object.fromEntries(REACTIONS.map((reaction) => [reaction.type, reaction])) as Record<
  ReactionType,
  (typeof REACTIONS)[number]
>;

/** The summary after switching your reaction to `next` (null removes it), for showing a tap instantly. */
export function withReaction(summary: ReactionSummary, next: ReactionType | null): ReactionSummary {
  const counts = { ...summary.counts };
  if (summary.mine) counts[summary.mine] -= 1;
  if (next) counts[next] += 1;
  const total = summary.total - (summary.mine ? 1 : 0) + (next ? 1 : 0);
  return { counts, total, mine: next };
}

type GroupEmojiSize = "md" | "lg" | "xl";

const sizeClasses: Record<GroupEmojiSize, string> = {
  md: "size-12 rounded-2xl text-2xl",
  lg: "size-20 rounded-3xl text-4xl",
  xl: "size-24 rounded-[1.75rem] text-5xl",
};

/** The group's emoji on a tile. Decorative: the group name is always shown alongside. */
export function GroupEmoji({ emoji, size = "md" }: { emoji: string; size?: GroupEmojiSize }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center border border-ink-700/70 bg-linear-to-br from-ink-700 to-ink-800 shadow-lg shadow-black/30 ${sizeClasses[size]}`}
    >
      {emoji}
    </span>
  );
}

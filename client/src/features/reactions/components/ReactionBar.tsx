import type { Photo } from "../../photos/types";
import { useReact } from "../hooks";
import { REACTIONS } from "../reactions";

/**
 * The five reactions with their counts. Tap one to react, another to change, and your
 * current one again to take it back. Without access to the group (you posted this, then
 * left) it's read-only, except that you can still take back your own reaction.
 */
export function ReactionBar({ photo }: { photo: Pick<Photo, "id" | "groupId" | "reactions" | "canInteract"> }) {
  const react = useReact(photo);
  const { counts, mine } = photo.reactions;

  return (
    <div role="group" aria-label="Reactions" className="flex flex-wrap gap-1.5">
      {REACTIONS.map(({ type, emoji, label }) => {
        const selected = mine === type;
        const count = counts[type];
        return (
          <button
            key={type}
            type="button"
            aria-pressed={selected}
            aria-label={`${label}${count ? `, ${count}` : ""}`}
            title={label}
            disabled={!photo.canInteract && !selected}
            onClick={() => react.mutate(selected ? null : type)}
            className={`inline-flex h-9 min-w-11 items-center justify-center gap-1 rounded-full border px-2.5 text-sm transition active:scale-95 disabled:opacity-40 ${
              selected
                ? "border-brand-orange/70 bg-brand-orange/15 text-ink-50"
                : "border-ink-700 bg-ink-900/60 text-ink-200 hover:border-ink-400"
            }`}
          >
            <span aria-hidden className="text-base leading-none">
              {emoji}
            </span>
            {count > 0 && <span className="font-semibold tabular-nums">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

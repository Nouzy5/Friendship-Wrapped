import { Link } from "react-router";
import { PlayIcon } from "../../../components/ui/icons";
import { fromListState, wrappedPath } from "../links";
import type { WrappedSummary } from "../types";

/** A group's Wrapped for a year, ready to play. */
export function WrappedCard({ wrapped: { group, year, final } }: { wrapped: WrappedSummary }) {
  return (
    <Link
      to={wrappedPath(year, group.id)}
      state={fromListState}
      aria-label={`Play ${group.name}: ${year} Wrapped${final ? "" : " so far"}`}
      className="flex items-center gap-4 rounded-3xl bg-linear-to-br from-brand-rose via-brand-orange to-brand-gold p-4 text-ink-950 shadow-xl shadow-brand-rose/20 transition hover:brightness-105 active:scale-[0.99]"
    >
      <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/30 text-3xl">
        {group.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold tracking-[0.2em] uppercase opacity-75">
          {final ? `${year} Wrapped` : `${year} so far`}
        </span>
        <span className="block truncate text-xl font-black">{group.name}</span>
      </span>
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-ink-950 text-ink-50">
        <PlayIcon className="size-5" />
      </span>
    </Link>
  );
}

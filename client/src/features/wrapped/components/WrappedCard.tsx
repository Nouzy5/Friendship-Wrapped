import { Link } from "react-router";
import { PlayIcon } from "../../../components/ui/icons";
import { GroupAvatar } from "../../groups/components/GroupAvatar";
import { fromListState, wrappedPath } from "../links";
import type { WrappedSummary } from "../types";

/** A group's Wrapped for a year, ready to play. */
export function WrappedCard({ wrapped: { group, year, final } }: { wrapped: WrappedSummary }) {
  return (
    <Link
      to={wrappedPath(year, group.id)}
      state={fromListState}
      aria-label={`Play ${group.name}: ${year} Wrapped${final ? "" : " so far"}`}
      className="group flex items-center gap-4 rounded-3xl bg-surface p-3 pr-4 transition hover:bg-line active:scale-[0.98]"
    >
      <GroupAvatar group={group} size={60} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xl font-semibold font-stretch-112%">{group.name}</span>
        <span className="block text-sm text-sub">{final ? `${year} Wrapped` : `${year} so far`}</span>
      </span>
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-inverse text-on-inverse transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110">
        <PlayIcon className="size-5" />
      </span>
    </Link>
  );
}

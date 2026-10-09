import { Link } from "react-router";
import { formatRelativeTime } from "../../../lib/format";
import { describeMomentEnd } from "../time-left";
import type { Moment } from "../types";

export const momentPath = (momentId: string) => `/memories/moments/${momentId}`;

/** A moment in the list: its newest photo, name, and whether it's still going. */
export function MomentCard({ moment }: { moment: Moment }) {
  return (
    <Link to={momentPath(moment.id)} className="group flex flex-col gap-2 rounded-2xl">
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl bg-surface">
        {moment.cover ? (
          <img
            src={moment.cover.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition group-hover:opacity-90"
          />
        ) : (
          <span aria-hidden className="text-5xl">
            {moment.emoji ?? "✨"}
          </span>
        )}
        {moment.isOpen && (
          <span className="absolute top-2 left-2 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-on-accent">Happening now</span>
        )}
      </div>
      <div className="min-w-0 px-1">
        <p className="truncate font-semibold text-fg">
          {moment.emoji && <span aria-hidden>{moment.emoji} </span>}
          {moment.title}
        </p>
        <p className="text-xs text-sub">
          {moment.photoCount === 1 ? "1 photo" : `${moment.photoCount} photos`} ·{" "}
          {moment.isOpen ? describeMomentEnd(moment.endsAt, true) : formatRelativeTime(moment.startsAt)}
        </p>
      </div>
    </Link>
  );
}

import { PlayIcon } from "../../../components/ui/icons";
import { formatDuration } from "../../../lib/format";
import type { Photo } from "../types";

/**
 * Marks a video over its poster picture: a play symbol and how long it is, or "LIVE" for a Live
 * Photo's motion. Nothing for a photo. Sits in a corner of a `relative` box.
 */
export function MediaBadge({ photo, className = "bottom-2 right-2" }: { photo: Pick<Photo, "kind" | "video">; className?: string }) {
  if (photo.kind !== "video" || !photo.video) return null;
  const { isLive, durationMs } = photo.video;

  return (
    <span
      className={`pointer-events-none absolute ${className} inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[0.6875rem] leading-tight font-semibold text-white backdrop-blur-sm`}
    >
      {isLive ? (
        <span aria-hidden>LIVE</span>
      ) : (
        <>
          <PlayIcon aria-hidden className="size-2.5" />
          <span aria-hidden className="tabular-nums">
            {formatDuration(durationMs)}
          </span>
        </>
      )}
      <span className="sr-only">{isLive ? "Live Photo" : `Video, ${formatDuration(durationMs)}`}</span>
    </span>
  );
}

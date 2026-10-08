import { useEffect, useEffectEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { StepDirection } from "../../../components/PageTransition";
import { ChevronLeftIcon, ChevronRightIcon } from "../../../components/ui/icons";
import { headerIconClasses, PageHeader } from "../../../components/ui/PageHeader";
import { formatDateTime } from "../../../lib/format";
import { useSwipe } from "../../../lib/useSwipe";
import { CommentsSection } from "../../comments/components/CommentsSection";
import { FavoriteButton } from "../../favorites/components/FavoriteButton";
import { useGroupPeople } from "../../groups/hooks";
import { ReactionBar } from "../../reactions/components/ReactionBar";
import { ReactionsDialog } from "../../reactions/components/ReactionsDialog";
import { usePrefetchPhoto } from "../hooks";
import type { PhotoDetail } from "../types";
import { cameFromFeed, photoPath } from "../viewer-link";
import { FullscreenPhoto } from "./FullscreenPhoto";
import { NameTag } from "./NameTag";
import { photoAlt, PhotoImage } from "./PhotoImage";
import { PhotoMenu } from "./PhotoMenu";

const stepButtonClasses =
  "absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65";

/** Arrow keys belong to whatever has focus when it's a text field or a dialog. */
function isTypingOrInDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea, select, [contenteditable], dialog, [role=menu]") !== null;
}

/**
 * One photo, large, with who posted it (in their colour), when, its caption, reactions and comments.
 * Swiping, the arrow buttons or the arrow keys step through the group's feed (left = newer, as if
 * scrolling the feed up). Tapping the photo shows it full size.
 */
export function PhotoViewer({ photo }: { photo: PhotoDetail }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { colorOf } = useGroupPeople(photo.groupId);
  const [fullscreen, setFullscreen] = useState(false);
  const [showingReactions, setShowingReactions] = useState(false);

  const fromFeed = cameFromFeed(location.state);
  // Without the feed (you posted this, then left the group), there's no group page to return to.
  const backTo = photo.feed ? `/groups/${photo.group.id}` : "/home";
  const newerId = photo.feed?.newerId ?? null;
  const olderId = photo.feed?.olderId ?? null;

  usePrefetchPhoto(newerId);
  usePrefetchPhoto(olderId);

  function goBack() {
    if (fromFeed) void navigate(-1);
    else void navigate(backTo, { replace: true });
  }

  // Stepping replaces the history entry, so "back" still returns to the feed in one go. The step
  // tells the page transition which side the next photo comes in from.
  function showPhoto(photoId: string | null, step: StepDirection) {
    if (!photoId) return;
    const state = { ...(location.state as object | null), step };
    void navigate(photoPath(photoId), { replace: true, state });
  }

  const swipe = useSwipe({ onSwipeLeft: () => showPhoto(olderId, "older"), onSwipeRight: () => showPhoto(newerId, "newer") });

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (fullscreen || showingReactions || isTypingOrInDialog(event.target) || isTypingOrInDialog(document.activeElement)) return;
    if (event.key === "ArrowLeft") showPhoto(newerId, "newer");
    if (event.key === "ArrowRight") showPhoto(olderId, "older");
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <article className="flex flex-col gap-4 px-2 pt-2">
      <h1 className="sr-only">{photoAlt(photo)}</h1>
      <div className="px-2">
        <PageHeader
          backTo={fromFeed ? undefined : backTo}
          onBack={fromFeed ? goBack : undefined}
          backLabel={photo.feed ? `Back to ${photo.group.name}` : "Back to home"}
          action={
            <div className="-mr-2.5 flex items-center">
              <FavoriteButton photo={photo} />
              <PhotoMenu photo={photo} groupName={photo.group.name} triggerClassName={headerIconClasses} onDeleted={goBack} />
            </div>
          }
        />
      </div>

      <div className="relative touch-pan-y touch-pinch-zoom" {...swipe}>
        <button type="button" onClick={() => setFullscreen(true)} aria-label="View full size" className="block w-full cursor-zoom-in rounded-[1.75rem]">
          <PhotoImage
            key={photo.id}
            photo={photo}
            variant="medium"
            fit="contain"
            priority
            className="max-h-[70dvh] w-full rounded-[1.75rem] bg-black"
            style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
          />
        </button>
        <div className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-1.5rem)]">
          <NameTag name={photo.uploader.displayName} color={colorOf(photo.uploader.id)} />
        </div>
        {newerId && (
          <button type="button" aria-label="Newer photo" onClick={() => showPhoto(newerId, "newer")} className={`${stepButtonClasses} left-2`}>
            <ChevronLeftIcon className="size-5" />
          </button>
        )}
        {olderId && (
          <button type="button" aria-label="Older photo" onClick={() => showPhoto(olderId, "older")} className={`${stepButtonClasses} right-2`}>
            <ChevronRightIcon className="size-5" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 px-2">
        <p className="text-[0.8125rem] text-sub">
          <time dateTime={photo.createdAt}>{formatDateTime(photo.createdAt)}</time>
          {photo.feed && (
            <>
              {" in "}
              <Link to={`/groups/${photo.group.id}`} className="font-medium text-fg underline-offset-2 hover:underline">
                {photo.group.name}
              </Link>
            </>
          )}
        </p>

        {photo.caption && <p className="text-base leading-snug break-words whitespace-pre-line">{photo.caption}</p>}

        <div className="flex flex-col items-start gap-1.5">
          <ReactionBar photo={photo} />
          {photo.reactions.total > 0 && (
            <button type="button" onClick={() => setShowingReactions(true)} className="min-h-9 text-sm text-sub underline-offset-2 hover:text-fg hover:underline">
              See who reacted
            </button>
          )}
        </div>
      </div>

      <div className="px-2 pt-2">
        {/* Keyed, so a half-written comment doesn't follow you to the next photo. */}
        <CommentsSection key={photo.id} photo={photo} />
      </div>

      <ReactionsDialog photoId={photo.id} groupId={photo.groupId} open={showingReactions} onClose={() => setShowingReactions(false)} />
      <FullscreenPhoto photo={photo} open={fullscreen} onClose={() => setFullscreen(false)} />
    </article>
  );
}

import { useEffect, useEffectEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { AlbumIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon } from "../../../components/ui/icons";
import { headerIconClasses, PageHeader } from "../../../components/ui/PageHeader";
import { getFormError } from "../../../lib/form-errors";
import { useSwipe } from "../../../lib/useSwipe";
import { PhotoAlbumsDialog } from "../../albums/components/PhotoAlbumsDialog";
import { CommentsSection } from "../../comments/components/CommentsSection";
import { FavoriteButton } from "../../favorites/components/FavoriteButton";
import { ReactionBar } from "../../reactions/components/ReactionBar";
import { ReactionsDialog } from "../../reactions/components/ReactionsDialog";
import { useDeletePhoto, usePrefetchPhoto } from "../hooks";
import type { PhotoDetail } from "../types";
import { cameFromFeed, photoPath } from "../viewer-link";
import { FullscreenPhoto } from "./FullscreenPhoto";
import { PhotoAttribution } from "./PhotoAttribution";
import { PhotoImage } from "./PhotoImage";

const stepButtonClasses =
  "absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-ink-50 backdrop-blur transition hover:bg-black/70";

/** Arrow keys belong to whatever has focus when it's a text field or a dialog. */
function isTypingOrInDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea, select, [contenteditable], dialog") !== null;
}

/**
 * One photo, large, with who posted it, when, its caption, reactions and comments.
 * Swiping, the arrow buttons or the arrow keys step through the group's feed
 * (left = newer, as if scrolling the feed up). Tapping the photo shows it full size.
 */
export function PhotoViewer({ photo }: { photo: PhotoDetail }) {
  const navigate = useNavigate();
  const location = useLocation();
  const remove = useDeletePhoto(photo);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showingReactions, setShowingReactions] = useState(false);
  const [choosingAlbums, setChoosingAlbums] = useState(false);

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

  // Stepping replaces the history entry, so "back" still returns to the feed in one go.
  function showPhoto(photoId: string | null) {
    if (photoId) void navigate(photoPath(photoId), { replace: true, state: location.state });
  }

  const swipe = useSwipe({ onSwipeLeft: () => showPhoto(olderId), onSwipeRight: () => showPhoto(newerId) });

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (confirmingDelete || fullscreen || showingReactions || choosingAlbums || isTypingOrInDialog(event.target)) return;
    if (event.key === "ArrowLeft") showPhoto(newerId);
    if (event.key === "ArrowRight") showPhoto(olderId);
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <article className="flex flex-col gap-4 py-2">
      <PageHeader
        backTo={fromFeed ? undefined : backTo}
        onBack={fromFeed ? goBack : undefined}
        backLabel={photo.feed ? `Back to ${photo.group.name}` : "Back to home"}
        action={
          // Pulled to the edge as a pair, so the last glyph lines up with the content.
          <div className="-mr-2 flex items-center">
            {photo.canInteract && (
              <button
                type="button"
                aria-label="Albums"
                title="Add to an album"
                className={headerIconClasses}
                onClick={() => setChoosingAlbums(true)}
              >
                <AlbumIcon className="size-5" />
              </button>
            )}
            <FavoriteButton photo={photo} />
            {photo.canDelete && (
              <button
                type="button"
                aria-label="Delete photo"
                className={headerIconClasses}
                onClick={() => setConfirmingDelete(true)}
              >
                <TrashIcon className="size-5" />
              </button>
            )}
          </div>
        }
      />

      <div className="relative touch-pan-y touch-pinch-zoom" {...swipe}>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          aria-label="View full size"
          className="block w-full cursor-zoom-in rounded-3xl"
        >
          <PhotoImage
            key={photo.id}
            photo={photo}
            variant="medium"
            fit="contain"
            priority
            className="max-h-[70dvh] w-full rounded-3xl bg-black"
            style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
          />
        </button>
        {newerId && (
          <button
            type="button"
            aria-label="Newer photo"
            onClick={() => showPhoto(newerId)}
            className={`${stepButtonClasses} left-2`}
          >
            <ChevronLeftIcon className="size-5" />
          </button>
        )}
        {olderId && (
          <button
            type="button"
            aria-label="Older photo"
            onClick={() => showPhoto(olderId)}
            className={`${stepButtonClasses} right-2`}
          >
            <ChevronRightIcon className="size-5" />
          </button>
        )}
      </div>

      <PhotoAttribution photo={photo} group={photo.feed ? photo.group : undefined} exactTime />

      {photo.caption && <p className="break-words whitespace-pre-line text-ink-50">{photo.caption}</p>}

      <div className="flex flex-col items-start gap-2">
        <ReactionBar photo={photo} />
        {photo.reactions.total > 0 && (
          <button
            type="button"
            onClick={() => setShowingReactions(true)}
            className="text-sm text-ink-400 underline-offset-2 hover:text-ink-200 hover:underline"
          >
            {photo.reactions.total === 1 ? "1 reaction" : `${photo.reactions.total} reactions`} · see who
          </button>
        )}
      </div>

      <CommentsSection photo={photo} />

      <ReactionsDialog photoId={photo.id} open={showingReactions} onClose={() => setShowingReactions(false)} />
      <PhotoAlbumsDialog photo={photo} open={choosingAlbums} onClose={() => setChoosingAlbums(false)} />

      <FullscreenPhoto photo={photo} open={fullscreen} onClose={() => setFullscreen(false)} />

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this photo?"
        description={`It will be removed for everyone in ${photo.group.name}. This can't be undone.`}
        confirmLabel="Delete photo"
        pendingLabel="Deleting…"
        variant="danger"
        isPending={remove.isPending}
        error={getFormError(remove.error)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: goBack })}
        onClose={() => {
          setConfirmingDelete(false);
          remove.reset();
        }}
      />
    </article>
  );
}

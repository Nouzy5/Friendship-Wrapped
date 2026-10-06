import { Link } from "react-router";
import { CommentIcon } from "../../../components/ui/icons";
import { COMMENTS_ANCHOR } from "../../comments/components/CommentsSection";
import { ReactionBar } from "../../reactions/components/ReactionBar";
import type { Photo } from "../types";
import { fromFeedState, photoPath } from "../viewer-link";
import { PhotoAttribution } from "./PhotoAttribution";
import { PhotoCaption } from "./PhotoCaption";
import { PhotoImage } from "./PhotoImage";

/** Feed photos keep their shape, within limits: very tall or very wide ones are cropped (the viewer shows them whole). */
function feedAspectRatio({ width, height }: Pick<Photo, "width" | "height">): number {
  return Math.min(Math.max(width / height, 3 / 4), 1.91);
}

/** One post in the group feed: who shared it and when, the photo, reactions, comments and caption. */
export function PhotoCard({ photo, priority = false }: { photo: Photo; priority?: boolean }) {
  const { commentCount } = photo;

  return (
    <article className="flex flex-col gap-3">
      <PhotoAttribution photo={photo} />
      <Link to={photoPath(photo.id)} state={fromFeedState} className="block rounded-3xl">
        <PhotoImage
          photo={photo}
          variant="medium"
          priority={priority}
          className="rounded-3xl"
          style={{ aspectRatio: feedAspectRatio(photo) }}
        />
      </Link>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <ReactionBar photo={photo} />
        </div>
        <Link
          to={`${photoPath(photo.id)}#${COMMENTS_ANCHOR}`}
          state={fromFeedState}
          aria-label={commentCount === 1 ? "1 comment" : `${commentCount} comments`}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm text-ink-200 transition hover:bg-ink-800 hover:text-ink-50"
        >
          <CommentIcon className="size-5" />
          {commentCount > 0 && <span className="font-semibold tabular-nums">{commentCount}</span>}
        </Link>
      </div>
      {photo.caption && <PhotoCaption text={photo.caption} />}
    </article>
  );
}

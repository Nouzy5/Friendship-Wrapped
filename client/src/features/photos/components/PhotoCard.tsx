import { Link } from "react-router";
import { CommentIcon } from "../../../components/ui/icons";
import { formatDateTime, formatShortAgo } from "../../../lib/format";
import { COMMENTS_ANCHOR } from "../../comments/components/CommentsSection";
import { FavoriteButton } from "../../favorites/components/FavoriteButton";
import { useGroupPeople } from "../../groups/hooks";
import { ReactionBar } from "../../reactions/components/ReactionBar";
import type { Photo } from "../types";
import { fromFeedState, photoPath } from "../viewer-link";
import { NameTag } from "./NameTag";
import { PhotoCaption } from "./PhotoCaption";
import { MediaBadge } from "./MediaBadge";
import { PhotoImage } from "./PhotoImage";
import { PhotoMenu } from "./PhotoMenu";

/** Feed photos are near-square, like the design; the viewer shows them whole. */
function feedAspectRatio({ width, height }: Pick<Photo, "width" | "height">): number {
  return Math.min(Math.max(width / height, 4 / 5), 5 / 4);
}

/** One post in the group feed: the photo with a name tag in the poster's colour, reactions, comments and caption. */
export function PhotoCard({ photo, groupName, priority = false }: { photo: Photo; groupName: string; priority?: boolean }) {
  const { commentCount } = photo;
  const { colorOf } = useGroupPeople(photo.groupId);

  return (
    <article className="flex flex-col">
      <div className="relative mx-2">
        <Link to={photoPath(photo.id)} state={fromFeedState} className="relative block rounded-[1.75rem]">
          <PhotoImage photo={photo} variant="medium" priority={priority} className="rounded-[1.75rem]" style={{ aspectRatio: feedAspectRatio(photo) }} />
          <MediaBadge photo={photo} className="right-4 bottom-4" />
        </Link>
        <div className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-4.5rem)]">
          <NameTag name={photo.uploader.displayName} color={colorOf(photo.uploader.id)}>
            <time dateTime={photo.createdAt} title={formatDateTime(photo.createdAt)}>
              {formatShortAgo(photo.createdAt)}
            </time>
          </NameTag>
        </div>
        <div className="absolute top-1.5 right-1.5">
          <PhotoMenu
            photo={photo}
            groupName={groupName}
            triggerClassName="grid size-11 place-items-center rounded-full text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.5)] transition hover:bg-black/20"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-2 pt-2">
        <ReactionBar photo={photo} />
        <div className="ml-auto flex shrink-0 items-center">
          <Link
            to={`${photoPath(photo.id)}#${COMMENTS_ANCHOR}`}
            state={fromFeedState}
            aria-label={commentCount === 1 ? "1 comment" : `${commentCount} comments`}
            className="inline-flex h-11 items-center gap-1.5 rounded-full px-2 text-[0.9375rem] font-semibold transition hover:bg-surface"
          >
            <CommentIcon className="size-[1.375rem]" />
            {commentCount > 0 && <span className="tabular-nums">{commentCount}</span>}
          </Link>
          <FavoriteButton photo={photo} />
        </div>
      </div>

      {photo.caption && (
        <div className="px-4 pt-2">
          <PhotoCaption text={photo.caption} />
        </div>
      )}
      {commentCount > 1 && (
        <Link to={`${photoPath(photo.id)}#${COMMENTS_ANCHOR}`} state={fromFeedState} className="self-start px-4 pt-1 text-sm text-sub hover:text-fg">
          View all {commentCount} comments
        </Link>
      )}
    </article>
  );
}

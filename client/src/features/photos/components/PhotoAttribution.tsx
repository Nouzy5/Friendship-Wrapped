import { Link } from "react-router";
import { Avatar } from "../../../components/ui/Avatar";
import { formatDateTime, formatRelativeTime } from "../../../lib/format";
import type { Photo, PhotoDetail } from "../types";

type PhotoAttributionProps = {
  photo: Pick<Photo, "uploader" | "createdAt">;
  /** Links to the group the photo was shared with. */
  group?: PhotoDetail["group"];
  /** "5 Oct 2026, 22:59" instead of "2 hours ago". */
  exactTime?: boolean;
};

/** Who posted a photo, and when. */
export function PhotoAttribution({ photo, group, exactTime = false }: PhotoAttributionProps) {
  const { uploader, createdAt } = photo;

  return (
    <div className="flex items-center gap-3">
      <Avatar name={uploader.displayName} seed={uploader.id} src={uploader.avatarUrl} />
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink-50">{uploader.displayName}</p>
        <p className="truncate text-xs text-ink-400">
          <time dateTime={createdAt} title={formatDateTime(createdAt)}>
            {exactTime ? formatDateTime(createdAt) : formatRelativeTime(createdAt)}
          </time>
          {group && (
            <>
              {" · "}
              <Link to={`/groups/${group.id}`} className="underline-offset-2 hover:text-ink-200 hover:underline">
                {group.emoji} {group.name}
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

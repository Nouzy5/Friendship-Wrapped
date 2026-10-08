import { Avatar } from "../../../components/ui/Avatar";
import { TrashIcon } from "../../../components/ui/icons";
import { formatDateTime, formatRelativeTime } from "../../../lib/format";
import type { MemberColor } from "../../../lib/member-colors";
import type { Comment } from "../types";

/** `color` is the author's colour in the photo's group. */
type CommentItemProps = { comment: Comment; color: MemberColor | null; onDelete: (comment: Comment) => void };

export function CommentItem({ comment, color, onDelete }: CommentItemProps) {
  const { author, body, createdAt } = comment;

  return (
    <li className="flex animate-list-in gap-3">
      <Avatar name={author.displayName} src={author.avatarUrl} color={color} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem]">
          <span className="font-semibold">{author.displayName}</span>{" "}
          <time dateTime={createdAt} title={formatDateTime(createdAt)} className="text-[0.8125rem] text-sub">
            {formatRelativeTime(createdAt)}
          </time>
        </p>
        <p className="text-[0.9375rem] leading-snug break-words whitespace-pre-line">{body}</p>
      </div>
      {comment.canDelete && (
        <button
          type="button"
          aria-label="Delete comment"
          onClick={() => onDelete(comment)}
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-sub transition hover:bg-surface hover:text-fg"
        >
          <TrashIcon className="size-4" />
        </button>
      )}
    </li>
  );
}

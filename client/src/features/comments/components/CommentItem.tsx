import { Avatar } from "../../../components/ui/Avatar";
import { TrashIcon } from "../../../components/ui/icons";
import { formatDateTime, formatRelativeTime } from "../../../lib/format";
import type { Comment } from "../types";

type CommentItemProps = { comment: Comment; onDelete: (comment: Comment) => void };

export function CommentItem({ comment, onDelete }: CommentItemProps) {
  const { author, body, createdAt } = comment;

  return (
    <li className="flex gap-3">
      <Avatar name={author.displayName} seed={author.id} src={author.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold text-ink-50">{author.displayName}</span>{" "}
          <time dateTime={createdAt} title={formatDateTime(createdAt)} className="text-xs text-ink-400">
            {formatRelativeTime(createdAt)}
          </time>
        </p>
        <p className="text-sm break-words whitespace-pre-line text-ink-50">{body}</p>
      </div>
      {comment.canDelete && (
        <button
          type="button"
          aria-label="Delete comment"
          onClick={() => onDelete(comment)}
          className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full text-ink-400 transition hover:bg-ink-800 hover:text-ink-50"
        >
          <TrashIcon className="size-4" />
        </button>
      )}
    </li>
  );
}

import { useId } from "react";
import { Avatar } from "../../../components/ui/Avatar";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { useModal } from "../../../lib/useModal";
import { useReactionList } from "../hooks";
import { reactionByType } from "../reactions";

type ReactionsDialogProps = { photoId: string; open: boolean; onClose: () => void };

/** Who reacted to a photo, and with what. */
export function ReactionsDialog({ photoId, open, onClose }: ReactionsDialogProps) {
  const ref = useModal(open);
  const titleId = useId();
  const reactions = useReactionList(photoId, open);

  let content;
  if (reactions.isPending) {
    content = (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  } else if (reactions.isError) {
    content = <p className="py-4 text-sm text-ink-400">Couldn't load reactions. Check your connection.</p>;
  } else if (reactions.data.length === 0) {
    content = <p className="py-4 text-sm text-ink-400">No reactions yet.</p>;
  } else {
    content = (
      <ul className="flex flex-col gap-3 py-2">
        {reactions.data.map(({ user, type }) => (
          <li key={user.id} className="flex items-center gap-3">
            <Avatar name={user.displayName} seed={user.id} src={user.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1 truncate font-medium">{user.displayName}</span>
            <span className="text-xl" role="img" aria-label={reactionByType[type].label}>
              {reactionByType[type].emoji}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto max-h-[70dvh] w-[min(calc(100%-2rem),24rem)] rounded-3xl border border-ink-700 bg-ink-900 p-6 text-ink-50 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <h2 id={titleId} className="text-lg font-bold">
        Reactions
      </h2>
      <div className="mt-2">{content}</div>
      <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>
        Close
      </Button>
    </dialog>
  );
}

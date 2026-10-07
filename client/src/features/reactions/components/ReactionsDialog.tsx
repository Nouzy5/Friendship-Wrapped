import { Avatar } from "../../../components/ui/Avatar";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { Spinner } from "../../../components/ui/Spinner";
import { useReactionList } from "../hooks";
import { reactionByType } from "../reactions";

type ReactionsDialogProps = { photoId: string; open: boolean; onClose: () => void };

/** Who reacted to a photo, and with what. */
export function ReactionsDialog({ photoId, open, onClose }: ReactionsDialogProps) {
  const reactions = useReactionList(photoId, open);

  let content;
  if (reactions.isPending) {
    content = (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  } else if (reactions.isLoadingError) {
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
    <Dialog open={open} onClose={onClose} title="Reactions">
      <div className="mt-2 min-h-0 overflow-y-auto">{content}</div>
      <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>
        Close
      </Button>
    </Dialog>
  );
}

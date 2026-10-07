import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { LoadMore } from "../../../components/ui/LoadMore";
import { Spinner } from "../../../components/ui/Spinner";
import { getFormError } from "../../../lib/form-errors";
import type { Photo } from "../../photos/types";
import { useComments, useDeleteComment } from "../hooks";
import type { Comment } from "../types";
import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";

/** Links to `#comments` (e.g. a feed post's comment count) land here. */
export const COMMENTS_ANCHOR = "comments";

type CommentsSectionProps = { photo: Pick<Photo, "id" | "groupId" | "commentCount" | "canInteract"> };

/** A photo's comments, oldest first, with a box to add one and delete for your own. */
export function CommentsSection({ photo }: CommentsSectionProps) {
  const comments = useComments(photo.id);
  const remove = useDeleteComment(photo);
  const [toDelete, setToDelete] = useState<Comment | null>(null);
  const ref = useRef<HTMLElement>(null);
  const { hash } = useLocation();

  // The photo may still have been loading when the browser looked for the anchor.
  useEffect(() => {
    if (hash === `#${COMMENTS_ANCHOR}`) ref.current?.scrollIntoView();
  }, [hash]);

  function closeDialog() {
    setToDelete(null);
    remove.reset();
  }

  let list;
  if (comments.isPending) {
    list = (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  } else if (comments.isLoadingError) {
    list = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink-400">Couldn't load comments.</p>
        <Button variant="secondary" onClick={() => void comments.refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (comments.data.length === 0) {
    list = <p className="text-sm text-ink-400">No comments yet.</p>;
  } else {
    list = (
      <>
        <ul className="flex flex-col gap-4">
          {comments.data.map((comment) => (
            <CommentItem key={comment.id} comment={comment} onDelete={setToDelete} />
          ))}
        </ul>
        <LoadMore
          hasMore={comments.hasNextPage}
          isLoading={comments.isFetchingNextPage}
          isError={comments.isFetchNextPageError}
          onLoadMore={() => void comments.fetchNextPage()}
          label="Show more comments"
        />
      </>
    );
  }

  return (
    <section
      ref={ref}
      id={COMMENTS_ANCHOR}
      aria-labelledby="comments-heading"
      className="flex scroll-mt-20 flex-col gap-4"
    >
      <h2 id="comments-heading" className="text-sm font-semibold tracking-wide text-ink-200 uppercase">
        Comments{photo.commentCount > 0 && <span className="text-ink-400"> · {photo.commentCount}</span>}
      </h2>
      {list}
      {photo.canInteract ? (
        <CommentComposer photo={photo} />
      ) : (
        <p className="text-sm text-ink-400">You've left this group, so you can't comment any more.</p>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete your comment?"
        description="It will be removed for everyone. This can't be undone."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        isPending={remove.isPending}
        error={getFormError(remove.error)}
        onClose={closeDialog}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id, { onSuccess: closeDialog });
        }}
      />
    </section>
  );
}

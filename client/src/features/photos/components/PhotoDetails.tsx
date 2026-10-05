import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Avatar } from "../../../components/ui/Avatar";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { TrashIcon } from "../../../components/ui/icons";
import { headerIconLinkClasses, PageHeader } from "../../../components/ui/PageHeader";
import { getFormError } from "../../../lib/form-errors";
import { formatDateTime } from "../../../lib/format";
import { useDeletePhoto } from "../hooks";
import type { PhotoDetail } from "../types";
import { photoAlt } from "./PhotoGrid";

export function PhotoDetails({ photo }: { photo: PhotoDetail }) {
  const navigate = useNavigate();
  const remove = useDeletePhoto(photo);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const groupPath = `/groups/${photo.group.id}`;

  return (
    <article className="flex flex-col gap-4 py-2">
      <PageHeader
        backTo={groupPath}
        backLabel={`Back to ${photo.group.name}`}
        action={
          photo.canDelete && (
            <button
              type="button"
              aria-label="Delete photo"
              className={headerIconLinkClasses}
              onClick={() => setConfirmingDelete(true)}
            >
              <TrashIcon className="size-5" />
            </button>
          )
        }
      />

      <img
        src={photo.imageUrls.medium}
        alt={photoAlt(photo)}
        width={photo.width}
        height={photo.height}
        decoding="async"
        className="h-auto w-full rounded-3xl bg-ink-800"
      />

      <div className="flex items-center gap-3">
        <Avatar name={photo.uploader.displayName} seed={photo.uploader.id} src={photo.uploader.avatarUrl} />
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-50">{photo.uploader.displayName}</p>
          <p className="truncate text-xs text-ink-400">
            <time dateTime={photo.createdAt}>{formatDateTime(photo.createdAt)}</time>
            {" · "}
            <Link to={groupPath} className="underline-offset-2 hover:text-ink-200 hover:underline">
              {photo.group.emoji} {photo.group.name}
            </Link>
          </p>
        </div>
      </div>

      {photo.caption && <p className="whitespace-pre-line text-ink-50">{photo.caption}</p>}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this photo?"
        description={`It will be removed for everyone in ${photo.group.name}. This can't be undone.`}
        confirmLabel="Delete photo"
        pendingLabel="Deleting…"
        variant="danger"
        isPending={remove.isPending}
        error={getFormError(remove.error)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => void navigate(groupPath, { replace: true }) })}
        onClose={() => {
          setConfirmingDelete(false);
          remove.reset();
        }}
      />
    </article>
  );
}

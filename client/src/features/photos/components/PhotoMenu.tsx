import { useState } from "react";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { AlbumIcon, BlockIcon, DownloadIcon, FlagIcon, MoreIcon, TrashIcon } from "../../../components/ui/icons";
import { Menu, type MenuItem } from "../../../components/ui/Menu";
import { getFormError } from "../../../lib/form-errors";
import { toast } from "../../../lib/toast";
import { PhotoAlbumsDialog } from "../../albums/components/PhotoAlbumsDialog";
import { useCurrentUser } from "../../auth/hooks";
import { ReportDialog } from "../../settings/components/ReportDialog";
import { useBlockPerson } from "../../settings/hooks";
import { useDeletePhoto } from "../hooks";
import type { Photo } from "../types";

type PhotoMenuProps = {
  photo: Photo;
  groupName: string;
  triggerClassName: string;
  /** After the photo is deleted (the viewer goes back to the feed). */
  onDeleted?: () => void;
};

/** "More" for a photo: add to an album, save, report, block whoever posted it, delete your own. */
export function PhotoMenu({ photo, groupName, triggerClassName, onDeleted }: PhotoMenuProps) {
  const me = useCurrentUser();
  const remove = useDeletePhoto(photo);
  const block = useBlockPerson();
  const [dialog, setDialog] = useState<"albums" | "report" | "block" | "delete" | null>(null);
  const mine = photo.uploader.id === me.id;
  const firstName = photo.uploader.displayName.split(/\s+/)[0];

  const items: MenuItem[] = [];
  if (photo.canInteract) items.push({ label: "Add to an album", icon: AlbumIcon, onSelect: () => setDialog("albums") });
  if (photo.canSave) items.push({ label: "Save photo", icon: DownloadIcon, href: `${photo.imageUrls.full}?download=1`, download: true });
  if (!mine) {
    items.push({ label: "Report photo", icon: FlagIcon, onSelect: () => setDialog("report") });
    items.push({ label: `Block ${firstName}`, icon: BlockIcon, onSelect: () => setDialog("block") });
  }
  if (photo.canDelete) items.push({ label: "Delete photo", icon: TrashIcon, onSelect: () => setDialog("delete") });

  if (items.length === 0) return null;

  return (
    <>
      <Menu label="More options" trigger={<MoreIcon className="size-[1.375rem]" />} triggerClassName={triggerClassName} items={items} />

      <PhotoAlbumsDialog photo={photo} open={dialog === "albums"} onClose={() => setDialog(null)} />
      <ReportDialog open={dialog === "report"} onClose={() => setDialog(null)} photoId={photo.id} title="Report this photo" />

      <ConfirmDialog
        open={dialog === "block"}
        title={`Block ${photo.uploader.displayName}?`}
        description={`You won't see each other's photos, comments or reactions, even in ${groupName}. They aren't told. You can unblock them in Settings → Privacy & safety.`}
        confirmLabel="Block"
        pendingLabel="Blocking…"
        variant="danger"
        isPending={block.isPending}
        error={getFormError(block.error)}
        onConfirm={() =>
          block.mutate(photo.uploader.id, {
            onSuccess: () => {
              toast(`${photo.uploader.displayName} is blocked`);
              setDialog(null);
            },
          })
        }
        onClose={() => {
          setDialog(null);
          block.reset();
        }}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete this photo?"
        description={`It will be removed for everyone in ${groupName}. This can't be undone.`}
        confirmLabel="Delete photo"
        pendingLabel="Deleting…"
        variant="danger"
        isPending={remove.isPending}
        error={getFormError(remove.error)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast("Photo deleted");
              setDialog(null);
              onDeleted?.();
            },
          })
        }
        onClose={() => {
          setDialog(null);
          remove.reset();
        }}
      />
    </>
  );
}

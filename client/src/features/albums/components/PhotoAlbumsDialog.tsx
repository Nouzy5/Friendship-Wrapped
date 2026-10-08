import { useId, useState, type FormEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { AlbumIcon, PlusIcon } from "../../../components/ui/icons";
import { Spinner } from "../../../components/ui/Spinner";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import type { Photo } from "../../photos/types";
import { useAlbums, useCreateAlbum, usePhotoAlbumIds, usePhotoAlbumToggle } from "../hooks";

type PhotoAlbumsDialogProps = { photo: Pick<Photo, "id" | "groupId">; open: boolean; onClose: () => void };

/** Tick the group's albums this photo should be in, or start a new one with it. */
export function PhotoAlbumsDialog({ photo, open, onClose }: PhotoAlbumsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Albums">
      <AlbumChecklist photo={photo} />
      <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>
        Done
      </Button>
    </Dialog>
  );
}

function AlbumChecklist({ photo }: { photo: Pick<Photo, "id" | "groupId"> }) {
  const albums = useAlbums(photo.groupId);
  const albumIds = usePhotoAlbumIds(photo.id, true);
  const toggle = usePhotoAlbumToggle(photo.id);

  if (albums.isPending || albumIds.isPending) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }
  if (albums.isLoadingError || albumIds.isLoadingError) {
    return <p className="py-4 text-sm text-sub">Couldn't load albums. Check your connection.</p>;
  }

  return (
    <div className="mt-3 flex min-h-0 flex-col gap-4">
      {albums.data.length === 0 ? (
        <p className="text-sm text-sub">No albums in this group yet. Start one with this photo:</p>
      ) : (
        <ul className="-mx-2 flex min-h-0 flex-col overflow-y-auto">
          {albums.data.map((album) => (
            <li key={album.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-surface">
                <input
                  type="checkbox"
                  checked={albumIds.data.includes(album.id)}
                  onChange={(event) => toggle.mutate({ albumId: album.id, add: event.target.checked })}
                  className="size-5 shrink-0 accent-(--accent)"
                />
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface">
                  {album.cover ? (
                    <img src={album.cover.thumbnailUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <AlbumIcon className="size-5 text-sub" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{album.name}</span>
                  <span className="block text-xs text-sub">
                    {album.photoCount === 1 ? "1 photo" : `${album.photoCount} photos`}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {toggle.isError && <Alert>{getFormError(toggle.error)}</Alert>}
      <NewAlbumWithPhoto
        groupId={photo.groupId}
        onCreated={(albumId) => toggle.mutate({ albumId, add: true })}
      />
    </div>
  );
}

function NewAlbumWithPhoto({ groupId, onCreated }: { groupId: string; onCreated: (albumId: string) => void }) {
  const create = useCreateAlbum(groupId);
  const [name, setName] = useState("");
  const inputId = useId();
  const error = getFieldErrors(create.error).name ?? getFormError(create.error);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(name, {
      onSuccess: (album) => {
        setName("");
        onCreated(album.id);
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="sr-only">
        New album name
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          value={name}
          maxLength={60}
          placeholder="New album…"
          onChange={(event) => setName(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-base text-fg outline-none placeholder:text-sub focus:border-fg"
        />
        <Button type="submit" variant="secondary" disabled={!name.trim() || create.isPending} aria-label="Create album">
          <PlusIcon className="size-4" />
          Create
        </Button>
      </div>
      {error && <p className="px-4 text-xs text-fg">{error}</p>}
    </form>
  );
}

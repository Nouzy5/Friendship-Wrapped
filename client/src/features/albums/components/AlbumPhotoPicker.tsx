import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { CheckIcon } from "../../../components/ui/icons";
import { LoadMore } from "../../../components/ui/LoadMore";
import { Spinner } from "../../../components/ui/Spinner";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import { MediaBadge } from "../../photos/components/MediaBadge";
import { PhotoImage, photoAlt } from "../../photos/components/PhotoImage";
import { useGroupFeed } from "../../photos/hooks";
import type { Photo } from "../../photos/types";
import { useAddToAlbum } from "../hooks";
import type { Album } from "../types";

type AlbumPhotoPickerProps = { album: Album; open: boolean; onClose: () => void };

/** The most photos the server adds in one go. */
const MAX_PHOTOS_PER_ADD = 100;

/** Pick photos from the group (newest first) to add to an album. */
export function AlbumPhotoPicker({ album, open, onClose }: AlbumPhotoPickerProps) {
  return (
    <Dialog open={open} onClose={onClose} title={`Add to ${album.name}`} size="lg">
      {/* Mounted per opening, so each visit starts with nothing selected. */}
      <Picker album={album} onClose={onClose} />
    </Dialog>
  );
}

function Picker({ album, onClose }: { album: Album; onClose: () => void }) {
  const photos = useGroupFeed(album.groupId);
  const add = useAddToAlbum(album.id);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  function toggle(photoId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(photoId) && next.size < MAX_PHOTOS_PER_ADD) next.add(photoId);
      return next;
    });
  }

  let content;
  if (photos.isPending) {
    content = (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  } else if (photos.isLoadingError) {
    content = <p className="py-6 text-sm text-sub">Couldn't load the group's photos.</p>;
  } else if (photos.data.length === 0) {
    content = <p className="py-6 text-sm text-sub">This group has no photos yet.</p>;
  } else {
    content = (
      <>
        <ul className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
          {photos.data.map((photo) => (
            <li key={photo.id}>
              <SelectablePhoto photo={photo} selected={selected.has(photo.id)} onToggle={() => toggle(photo.id)} />
            </li>
          ))}
        </ul>
        <LoadMore
          hasMore={photos.hasNextPage}
          isLoading={photos.isFetchingNextPage}
          isError={photos.isFetchNextPageError}
          onLoadMore={() => void photos.fetchNextPage()}
          label="Load more photos"
        />
      </>
    );
  }

  const count = selected.size;
  return (
    <>
      <p className="mt-1 text-sm text-sub" role="status">
        {count === MAX_PHOTOS_PER_ADD
          ? `You can add up to ${MAX_PHOTOS_PER_ADD} photos at a time.`
          : "Photos already in the album are skipped."}
      </p>
      <div className="-mx-2 mt-4 min-h-0 flex-1 overflow-y-auto px-2">{content}</div>
      {add.isError && (
        <div className="mt-3">
          <Alert>{getFieldErrors(add.error).photoIds ?? getFormError(add.error)}</Alert>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={add.isPending}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={count === 0 || add.isPending}
          onClick={() => add.mutate([...selected], { onSuccess: onClose })}
        >
          {add.isPending ? "Adding…" : count === 0 ? "Add" : count === 1 ? "Add 1 photo" : `Add ${count} photos`}
        </Button>
      </div>
    </>
  );
}

function SelectablePhoto({ photo, selected, onToggle }: { photo: Photo; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={photoAlt(photo)}
      onClick={onToggle}
      className="relative block w-full"
    >
      <PhotoImage photo={photo} variant="thumbnail" className="aspect-square" />
      <MediaBadge photo={photo} className="bottom-1.5 left-1.5" />
      {selected && <span aria-hidden className="absolute inset-0 bg-accent/25 ring-4 ring-accent ring-inset" />}
      <span
        aria-hidden
        className={`absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full border-2 ${
          selected ? "border-accent bg-accent text-on-accent" : "border-white/80 bg-black/30"
        }`}
      >
        {selected && <CheckIcon className="size-4" />}
      </span>
    </button>
  );
}

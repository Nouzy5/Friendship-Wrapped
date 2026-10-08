import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button, buttonClasses } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { PencilIcon, PlusIcon, TrashIcon } from "../components/ui/icons";
import { LoadMore } from "../components/ui/LoadMore";
import { headerIconClasses, PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { toast } from "../lib/toast";
import { StateMessage } from "../components/ui/StateMessage";
import { AlbumNameDialog } from "../features/albums/components/AlbumNameDialog";
import { AlbumPhotoPicker } from "../features/albums/components/AlbumPhotoPicker";
import { useAlbum, useAlbumPhotos, useDeleteAlbum, useRenameAlbum } from "../features/albums/hooks";
import type { Album } from "../features/albums/types";
import { PhotoGrid } from "../features/photos/components/PhotoGrid";
import { isNotFoundError } from "../lib/api-client";
import { getFormError } from "../lib/form-errors";
import { usePageTitle } from "../lib/usePageTitle";
import { PhotoGridSkeleton } from "../components/ui/Skeleton";

/** /memories/albums/:albumId */
export function AlbumPage() {
  const { albumId = "" } = useParams();
  const album = useAlbum(albumId);
  usePageTitle(album.data?.name ?? "Album");

  if (album.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  // A refetch that finds it gone (deleted meanwhile) counts too, even with the album cached.
  if (album.isLoadingError || (album.isRefetchError && isNotFoundError(album.error))) {
    return isNotFoundError(album.error) ? (
      <StateMessage
        headingLevel="h1"
        emoji="🔍"
        title="Album not found"
        description="It may have been deleted, or it's in a group you're not part of."
        action={
          <Link to="/memories" className={buttonClasses()}>
            Back to Memories
          </Link>
        }
      />
    ) : (
      <StateMessage
        headingLevel="h1"
        emoji="📡"
        title="Couldn't load this album"
        action={<Button onClick={() => void album.refetch()}>Try again</Button>}
      />
    );
  }
  return <AlbumDetails album={album.data} />;
}

type OpenDialog = "add" | "rename" | "delete" | null;

function AlbumDetails({ album }: { album: Album }) {
  const navigate = useNavigate();
  const photos = useAlbumPhotos(album.id);
  const rename = useRenameAlbum(album.id);
  const remove = useDeleteAlbum(album);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const backTo = `/memories?${new URLSearchParams({ group: album.groupId, tab: "albums" })}`;

  function closeDialog() {
    setDialog(null);
    rename.reset();
    remove.reset();
  }

  let content;
  if (photos.isPending) {
    content = <PhotoGridSkeleton />;
  } else if (photos.isLoadingError) {
    content = (
      <StateMessage
        emoji="📡"
        title="Couldn't load the photos"
        action={<Button onClick={() => void photos.refetch()}>Try again</Button>}
      />
    );
  } else if (photos.data.length === 0) {
    content = (
      <StateMessage
        emoji="🖼️"
        title="This album is empty"
        description="Add photos from the group. Anyone in the group can add to it."
      />
    );
  } else {
    content = (
      <>
        <PhotoGrid photos={photos.data} />
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

  return (
    <div className="flex flex-col gap-5 px-4 pt-3">
      <PageHeader
        backTo={backTo}
        backLabel="Back to albums"
        action={
          album.canManage && (
            <div className="-mr-2 flex items-center">
              <button type="button" aria-label="Rename album" className={headerIconClasses} onClick={() => setDialog("rename")}>
                <PencilIcon className="size-5" />
              </button>
              <button type="button" aria-label="Delete album" className={headerIconClasses} onClick={() => setDialog("delete")}>
                <TrashIcon className="size-5" />
              </button>
            </div>
          )
        }
      />

      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold font-stretch-112% tracking-tight break-words">{album.name}</h1>
        <p className="text-sm text-sub">
          {album.photoCount === 1 ? "1 photo" : `${album.photoCount} photos`}
          {album.createdBy && ` · started by ${album.createdBy.displayName}`}
        </p>
        <Button className="self-start" onClick={() => setDialog("add")}>
          <PlusIcon className="size-4" />
          Add photos
        </Button>
      </section>

      {content}

      <AlbumPhotoPicker album={album} open={dialog === "add"} onClose={closeDialog} />
      <AlbumNameDialog
        open={dialog === "rename"}
        onClose={closeDialog}
        title="Rename album"
        submitLabel="Save"
        initialName={album.name}
        isPending={rename.isPending}
        error={rename.error}
        onSubmit={(name) => rename.mutate(name, { onSuccess: closeDialog })}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete this album?"
        description="The album goes for everyone in the group. Its photos stay in the group."
        confirmLabel="Delete album"
        pendingLabel="Deleting…"
        variant="danger"
        isPending={remove.isPending}
        error={getFormError(remove.error)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast("Album deleted");
              void navigate(backTo, { replace: true });
            },
          })
        }
        onClose={closeDialog}
      />
    </div>
  );
}

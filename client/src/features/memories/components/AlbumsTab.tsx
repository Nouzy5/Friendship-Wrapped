import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../../components/ui/Button";
import { PlusIcon } from "../../../components/ui/icons";
import { StateMessage } from "../../../components/ui/StateMessage";
import { AlbumCard, albumPath } from "../../albums/components/AlbumCard";
import { AlbumNameDialog } from "../../albums/components/AlbumNameDialog";
import { useAlbums, useCreateAlbum } from "../../albums/hooks";
import { AlbumGridSkeleton } from "../../../components/ui/Skeleton";

/** The group's shared albums, with a button to start a new one. */
export function AlbumsTab({ groupId }: { groupId: string }) {
  const albums = useAlbums(groupId);
  const create = useCreateAlbum(groupId);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const newAlbumButton = (
    <Button onClick={() => setCreating(true)}>
      <PlusIcon className="size-4" />
      New album
    </Button>
  );

  let content;
  if (albums.isPending) {
    content = <AlbumGridSkeleton />;
  } else if (albums.isLoadingError) {
    content = (
      <StateMessage
        emoji="📡"
        title="Couldn't load albums"
        action={<Button onClick={() => void albums.refetch()}>Try again</Button>}
      />
    );
  } else if (albums.data.length === 0) {
    content = (
      <StateMessage
        emoji="📚"
        title="No albums yet"
        description="Gather a trip, a party or a whole summer into an album the whole group can add to."
        action={newAlbumButton}
      />
    );
  } else {
    content = (
      <>
        <div className="flex justify-end">{newAlbumButton}</div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5">
          {albums.data.map((album) => (
            <li key={album.id}>
              <AlbumCard album={album} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {content}
      <AlbumNameDialog
        open={creating}
        onClose={() => {
          setCreating(false);
          create.reset();
        }}
        title="New album"
        submitLabel="Create album"
        isPending={create.isPending}
        error={create.error}
        onSubmit={(name) => create.mutate(name, { onSuccess: (album) => void navigate(albumPath(album.id)) })}
      />
    </div>
  );
}

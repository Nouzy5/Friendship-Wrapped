import { Link } from "react-router";
import { AlbumIcon } from "../../../components/ui/icons";
import type { Album } from "../types";

export const albumPath = (albumId: string) => `/memories/albums/${albumId}`;

export function AlbumCard({ album }: { album: Album }) {
  return (
    <Link to={albumPath(album.id)} className="group flex flex-col gap-2 rounded-2xl">
      <div className="grid aspect-square place-items-center overflow-hidden rounded-2xl bg-ink-800">
        {album.cover ? (
          <img
            src={album.cover.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition group-hover:opacity-90"
          />
        ) : (
          <AlbumIcon className="size-10 text-ink-400" />
        )}
      </div>
      <div className="min-w-0 px-1">
        <p className="truncate font-semibold text-ink-50">{album.name}</p>
        <p className="text-xs text-ink-400">
          {album.photoCount === 1 ? "1 photo" : `${album.photoCount} photos`}
        </p>
      </div>
    </Link>
  );
}

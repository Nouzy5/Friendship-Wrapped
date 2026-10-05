import { Link } from "react-router";
import type { Photo } from "../types";

export function photoAlt(photo: Pick<Photo, "caption" | "uploader">): string {
  return photo.caption ?? `Photo by ${photo.uploader.displayName}`;
}

/** Square thumbnails, lazy-loaded, each linking to the photo's page. */
export function PhotoGrid({ photos }: { photos: Photo[] }) {
  return (
    <ul className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
      {photos.map((photo) => (
        <li key={photo.id}>
          <Link to={`/photos/${photo.id}`} className="block aspect-square bg-ink-800">
            <img
              src={photo.imageUrls.thumbnail}
              alt={photoAlt(photo)}
              width={480}
              height={480}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition hover:opacity-90"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

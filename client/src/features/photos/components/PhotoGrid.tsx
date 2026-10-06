import { Link } from "react-router";
import type { Photo } from "../types";
import { fromFeedState, photoPath } from "../viewer-link";
import { PhotoImage } from "./PhotoImage";

/** Square thumbnails, lazy-loaded, each opening the photo viewer. */
export function PhotoGrid({ photos }: { photos: Photo[] }) {
  return (
    <ul className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
      {photos.map((photo) => (
        <li key={photo.id}>
          <Link to={photoPath(photo.id)} state={fromFeedState} className="block transition hover:opacity-90">
            <PhotoImage photo={photo} variant="thumbnail" className="aspect-square" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

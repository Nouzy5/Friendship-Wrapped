import { Link } from "react-router";
import { memberFill } from "../../../lib/member-colors";
import { useGroupPeople } from "../../groups/hooks";
import type { Photo } from "../types";
import { fromFeedState, photoPath } from "../viewer-link";
import { photoAlt, PhotoImage } from "./PhotoImage";

/** Square thumbnails, lazy-loaded, each with a dot in the poster's colour, each opening the photo viewer. */
export function PhotoGrid({ photos }: { photos: Photo[] }) {
  const { colorOf } = useGroupPeople(photos[0]?.groupId);

  return (
    <ul className="grid grid-cols-3 gap-1">
      {photos.map((photo, index) => (
        <li key={photo.id} className="animate-pop-in [animation-duration:0.3s]" style={{ animationDelay: `${Math.min(index, 11) * 25}ms` }}>
          <Link
            to={photoPath(photo.id)}
            state={fromFeedState}
            aria-label={photoAlt(photo)}
            className="relative block overflow-hidden rounded-[0.875rem] transition hover:opacity-90"
          >
            <PhotoImage photo={photo} variant="thumbnail" className="aspect-square" />
            <span
              aria-hidden
              className="absolute bottom-2 left-2 size-3.5 rounded-full ring-2 ring-bg"
              style={{ background: memberFill(colorOf(photo.uploader.id)).background }}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

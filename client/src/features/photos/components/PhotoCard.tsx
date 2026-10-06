import { Link } from "react-router";
import type { Photo } from "../types";
import { fromFeedState, photoPath } from "../viewer-link";
import { PhotoAttribution } from "./PhotoAttribution";
import { PhotoCaption } from "./PhotoCaption";
import { PhotoImage } from "./PhotoImage";

/** Feed photos keep their shape, within limits: very tall or very wide ones are cropped (the viewer shows them whole). */
function feedAspectRatio({ width, height }: Pick<Photo, "width" | "height">): number {
  return Math.min(Math.max(width / height, 3 / 4), 1.91);
}

/** One post in the group feed: who shared it and when, the photo, its caption. */
export function PhotoCard({ photo, priority = false }: { photo: Photo; priority?: boolean }) {
  return (
    <article className="flex flex-col gap-3">
      <PhotoAttribution photo={photo} />
      <Link to={photoPath(photo.id)} state={fromFeedState} className="block rounded-3xl">
        <PhotoImage
          photo={photo}
          variant="medium"
          priority={priority}
          className="rounded-3xl"
          style={{ aspectRatio: feedAspectRatio(photo) }}
        />
      </Link>
      {photo.caption && <PhotoCaption text={photo.caption} />}
    </article>
  );
}

import { useState } from "react";
import { useDeviceSettings } from "../../../lib/device-settings";
import { usePrefersReducedMotion } from "../../../lib/usePrefersReducedMotion";
import type { Photo, PhotoVideo } from "../types";
import { MediaBadge } from "./MediaBadge";
import { photoAlt } from "./PhotoImage";

type VideoPlayerProps = {
  photo: Photo & { video: PhotoVideo };
  className?: string;
};

/**
 * A video post: its poster frame until it plays, then the video with the browser's own controls.
 * It is fetched in pieces from the API (with your session cookie), so it starts at once and can be
 * scrubbed. A Live Photo's motion plays by itself, muted and looping, unless motion is reduced
 * or Data saver is on, when it has controls like any video. Key it by photo id.
 */
export function VideoPlayer({ photo, className = "" }: VideoPlayerProps) {
  const { dataSaver } = useDeviceSettings();
  const reducedMotion = usePrefersReducedMotion();
  const [failed, setFailed] = useState(false);
  const { isLive, url } = photo.video;
  const autoPlays = isLive && !dataSaver && !reducedMotion;

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
      {failed ? (
        <>
          <img src={photo.imageUrls.medium} alt={photoAlt(photo)} className="absolute inset-0 size-full object-contain opacity-60" />
          <p role="alert" className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-white">
            Couldn't play this video
          </p>
        </>
      ) : (
        <video
          src={url}
          poster={photo.imageUrls.medium}
          aria-label={photoAlt(photo)}
          controls={!autoPlays}
          autoPlay={autoPlays}
          loop={autoPlays}
          muted={autoPlays}
          playsInline
          preload={dataSaver ? "none" : "metadata"}
          // Scrubbing the timeline must not count as a swipe to the next post.
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full bg-black object-contain"
        />
      )}
      {autoPlays && !failed && <MediaBadge photo={photo} className="top-3 right-3" />}
    </div>
  );
}

import { useState, type CSSProperties } from "react";
import { useDeviceSettings } from "../../../lib/device-settings";
import type { Photo, PhotoVariant } from "../types";

export function photoAlt(photo: Pick<Photo, "caption" | "uploader"> & { kind?: Photo["kind"] }): string {
  return photo.caption ?? `${photo.kind === "video" ? "Video" : "Photo"} by ${photo.uploader.displayName}`;
}

type PhotoImageProps = {
  photo: Pick<Photo, "caption" | "uploader" | "imageUrls">;
  variant: PhotoVariant;
  fit?: "cover" | "contain";
  /** For the first photo on screen: load straight away, at high priority. Everything else loads lazily. */
  priority?: boolean;
  /** Sizes the box (e.g. its aspect ratio); the image fills it. */
  className?: string;
  style?: CSSProperties;
};

/**
 * A photo that holds its space with a placeholder while it loads, and shows a quiet
 * message if it can't be loaded (e.g. it was just deleted). Key it by photo id.
 */
export function PhotoImage({ photo, variant, fit = "cover", priority = false, className = "", style }: PhotoImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  // Settings → Photos & data → Data saver: never the full-size rendition, the medium one is plenty on a phone.
  const { dataSaver } = useDeviceSettings();
  const shown = dataSaver && variant === "full" ? "medium" : variant;

  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      {status === "loading" && <div aria-hidden className="absolute inset-0 animate-pulse bg-surface motion-reduce:animate-none" />}
      {status === "failed" ? (
        <div className="absolute inset-0 grid place-items-center bg-surface p-4 text-center text-xs text-sub">
          Couldn't load this photo
        </div>
      ) : (
        <img
          src={photo.imageUrls[shown]}
          alt={photoAlt(photo)}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          draggable={false}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("failed")}
          className={`relative size-full transition-opacity duration-500 ease-out ${status === "loaded" ? "opacity-100" : "opacity-0"} ${fit === "cover" ? "object-cover" : "object-contain"}`}
        />
      )}
    </div>
  );
}

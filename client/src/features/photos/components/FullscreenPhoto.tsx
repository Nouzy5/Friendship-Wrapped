import { CloseIcon } from "../../../components/ui/icons";
import { useDeviceSettings } from "../../../lib/device-settings";
import { useModal } from "../../../lib/useModal";
import type { Photo } from "../types";
import { photoAlt } from "./PhotoImage";

type FullscreenPhotoProps = {
  photo: Pick<Photo, "caption" | "uploader" | "imageUrls">;
  open: boolean;
  onClose: () => void;
};

/**
 * The full-size photo on a black screen; pinch to zoom on phones. The medium size
 * (already loaded by the viewer) shows until the full size arrives, in exactly the same
 * spot. Built on <dialog>, so Escape closes it and focus stays inside.
 */
export function FullscreenPhoto({ photo, open, onClose }: FullscreenPhotoProps) {
  const ref = useModal(open);
  // Data saver stops at the medium size.
  const { dataSaver } = useDeviceSettings();

  return (
    <dialog
      ref={ref}
      aria-label="Full-size photo"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-black p-0 text-white backdrop:bg-black open:animate-fade-in"
    >
      {open && (
        <>
          <div
            className="relative size-full animate-sheet-up"
            // Tapping closes it, but not while pinch-zoomed in (that tap is for looking around).
            onClick={() => {
              if ((window.visualViewport?.scale ?? 1) <= 1.01) onClose();
            }}
          >
            <img src={photo.imageUrls.medium} alt="" className="absolute inset-0 size-full object-contain" />
            {dataSaver ? (
              <span className="sr-only">{photoAlt(photo)}</span>
            ) : (
              <img src={photo.imageUrls.full} alt={photoAlt(photo)} decoding="async" className="absolute inset-0 size-full object-contain" />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 grid size-11 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
          >
            <CloseIcon className="size-6" />
          </button>
        </>
      )}
    </dialog>
  );
}

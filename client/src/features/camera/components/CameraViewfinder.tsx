import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { buttonClasses } from "../../../components/ui/Button";
import { FileButton } from "../../../components/ui/FileButton";
import { CameraIcon, ImagesIcon, SwitchCameraIcon } from "../../../components/ui/icons";
import { Spinner } from "../../../components/ui/Spinner";
import { IMAGE_ACCEPT } from "../../../lib/image-files";
import { usePageHidden } from "../../../lib/usePageHidden";
import { captureFrame } from "../capture";
import { useCamera, type CameraProblem } from "../useCamera";

type CameraViewfinderProps = {
  onCapture: (photo: Blob) => void;
  /** A photo from the gallery, or from the phone's own camera app (fallback). */
  onPickFile: (file: File) => void;
};

/** How long the shutter flash shows before the preview replaces the camera. */
const FLASH_MS = 180;

const roundButtonClasses =
  "grid size-12 place-items-center rounded-full bg-ink-800 text-ink-50 transition hover:bg-ink-700 disabled:opacity-40";

function problemMessage(problem: CameraProblem): string {
  switch (problem) {
    case "unsupported":
      return window.isSecureContext
        ? "This browser can't show a live camera."
        : "The live camera only works over a secure (https://) connection.";
    case "denied":
      return "Camera access is blocked. Allow it in your browser's site settings and try again.";
    case "not-found":
      return "No camera was found on this device.";
    case "busy":
      return "Your camera is being used by another app.";
    case "unknown":
      return "The camera couldn't be started.";
  }
}

/** Live camera → shutter. Falls back to the phone's camera app or the gallery when there's no live camera. */
export function CameraViewfinder({ onCapture, onPickFile }: CameraViewfinderProps) {
  // Off while the app is in the background: the camera light goes out and the battery is spared.
  const camera = useCamera(!usePageHidden());
  const [flashes, setFlashes] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(3 / 4);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const mirrored = camera.facingMode === "user";
  const isLive = camera.state.status === "live";

  async function takePhoto() {
    const video = camera.videoRef.current;
    if (!video) return;
    try {
      setCaptureError(null);
      const photo = await captureFrame(video, mirrored);
      // Flash first; the preview takes over once it has been seen.
      setFlashes((count) => count + 1);
      window.setTimeout(() => onCapture(photo), FLASH_MS);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Couldn't capture the photo");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        className="relative mx-auto min-h-48 w-full overflow-hidden rounded-3xl bg-black"
        // As big as fits while the shutter stays above the navigation bar: the screen minus
        // the app header, page title, shutter row and navigation (~20.5rem) and safe areas.
        style={{
          aspectRatio,
          maxWidth: `calc((100dvh - 20.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)) * ${aspectRatio})`,
        }}
      >
        <video
          ref={camera.videoRef}
          muted
          playsInline
          aria-label="Camera preview"
          className={`size-full object-contain ${mirrored ? "-scale-x-100" : ""}`}
          onLoadedMetadata={(event) => {
            const { videoWidth, videoHeight } = event.currentTarget;
            if (videoWidth && videoHeight) setAspectRatio(videoWidth / videoHeight);
          }}
        />

        {camera.state.status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Spinner />
            <p className="text-sm text-ink-400">If your browser asks, allow the camera.</p>
          </div>
        )}

        {/* A white flash on the shutter, like a camera. */}
        {flashes > 0 && (
          <div
            key={flashes}
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-flash bg-white motion-reduce:hidden"
          />
        )}

        {camera.state.status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <CameraIcon className="size-10 text-ink-400" />
            <p className="text-sm text-ink-200">{problemMessage(camera.state.problem)}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <FileButton
                accept={IMAGE_ACCEPT}
                capture="environment"
                onFile={onPickFile}
                className={buttonClasses("primary")}
              >
                Use camera app
              </FileButton>
              {camera.state.problem !== "unsupported" && (
                <button type="button" onClick={camera.retry} className={buttonClasses("secondary")}>
                  Try again
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {captureError && <Alert>{captureError}</Alert>}

      <div className="flex items-center justify-between px-4">
        <FileButton
          accept={IMAGE_ACCEPT}
          onFile={onPickFile}
          aria-label="Choose from gallery"
          className={roundButtonClasses}
        >
          <ImagesIcon className="size-6" />
        </FileButton>

        <button
          type="button"
          onClick={() => void takePhoto()}
          disabled={!isLive}
          aria-label="Take photo"
          className="grid size-20 place-items-center rounded-full border-4 border-ink-50 transition active:scale-95 disabled:opacity-40"
        >
          <span className="size-15 rounded-full bg-linear-to-br from-brand-rose via-brand-orange to-brand-gold" />
        </button>

        {camera.canFlip ? (
          <button
            type="button"
            onClick={camera.flip}
            disabled={!isLive}
            aria-label="Switch camera"
            className={roundButtonClasses}
          >
            <SwitchCameraIcon className="size-6" />
          </button>
        ) : (
          // Keeps the shutter centred.
          <span aria-hidden className="size-12" />
        )}
      </div>
    </div>
  );
}

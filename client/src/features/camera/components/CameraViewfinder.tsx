import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { buttonClasses } from "../../../components/ui/Button";
import { FileButton } from "../../../components/ui/FileButton";
import { CameraIcon, ImagesIcon, SwitchCameraIcon } from "../../../components/ui/icons";
import { Spinner } from "../../../components/ui/Spinner";
import { useDeviceSettings } from "../../../lib/device-settings";
import { haptic } from "../../../lib/haptics";
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

const roundButtonClasses = "grid size-13 place-items-center rounded-full bg-surface text-fg transition hover:bg-line disabled:opacity-40";

function problemMessage(problem: CameraProblem): string {
  switch (problem) {
    case "unsupported":
      return window.isSecureContext ? "This browser can't show a live camera." : "The live camera only works over a secure (https://) connection.";
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

/** Live camera in a square → shutter. Falls back to the phone's camera app or the gallery when there's no live camera. */
export function CameraViewfinder({ onCapture, onPickFile }: CameraViewfinderProps) {
  const settings = useDeviceSettings();
  // Off while the app is in the background: the camera light goes out and the battery is spared.
  const camera = useCamera(!usePageHidden(), settings.cameraFacing);
  const [flashes, setFlashes] = useState(0);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const front = camera.facingMode === "user";
  const isLive = camera.state.status === "live";

  async function takePhoto() {
    const video = camera.videoRef.current;
    if (!video) return;
    try {
      setCaptureError(null);
      haptic();
      const photo = await captureFrame(video, front && settings.mirrorFrontCamera);
      // Flash first; the preview takes over once it has been seen.
      setFlashes((count) => count + 1);
      window.setTimeout(() => onCapture(photo), FLASH_MS);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Couldn't capture the photo");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div
        className="relative mx-auto aspect-square w-full overflow-hidden rounded-[2.75rem] bg-black"
        // As big as fits with the shutter row and the people row still on screen.
        style={{ maxWidth: "calc(100dvh - 19rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))" }}
      >
        <video
          ref={camera.videoRef}
          muted
          playsInline
          aria-label="Camera preview"
          // The front camera's preview is always mirrored, like a mirror.
          className={`size-full object-cover ${front ? "-scale-x-100" : ""}`}
        />

        {settings.cameraGrid && isLive && (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} className="border-[0.5px] border-white/35" />
            ))}
          </div>
        )}

        {camera.state.status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <Spinner />
            <p className="text-sm text-white/70">If your browser asks, allow the camera.</p>
          </div>
        )}

        {/* A white flash on the shutter, like a camera. */}
        {flashes > 0 && <div key={flashes} aria-hidden className="pointer-events-none absolute inset-0 animate-flash bg-white motion-reduce:hidden" />}

        {camera.state.status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <CameraIcon className="size-10 text-white/70" />
            <p className="text-[0.9375rem] text-white/80">{problemMessage(camera.state.problem)}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <FileButton accept={IMAGE_ACCEPT} capture="environment" onFile={onPickFile} className={buttonClasses("accent")}>
                Use camera app
              </FileButton>
              {camera.state.problem !== "unsupported" && (
                <button type="button" onClick={camera.retry} className="inline-flex min-h-12 items-center rounded-full bg-white/15 px-5 font-semibold text-white">
                  Try again
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {captureError && <Alert>{captureError}</Alert>}

      <div className="flex items-center justify-between px-8">
        <FileButton accept={IMAGE_ACCEPT} onFile={onPickFile} aria-label="Choose from your photos" className={roundButtonClasses}>
          <ImagesIcon className="size-6" />
        </FileButton>

        <button
          type="button"
          onClick={() => void takePhoto()}
          disabled={!isLive}
          aria-label="Take photo"
          className="flex size-22 rounded-full border-[5px] border-accent p-1.5 transition active:scale-95 disabled:opacity-40"
        >
          <span className="flex-1 rounded-full bg-accent" />
        </button>

        {camera.canFlip ? (
          <button type="button" onClick={camera.flip} disabled={!isLive} aria-label="Switch camera" className={roundButtonClasses}>
            <SwitchCameraIcon className="size-6" />
          </button>
        ) : (
          // Keeps the shutter centred.
          <span aria-hidden className="size-13" />
        )}
      </div>
    </div>
  );
}

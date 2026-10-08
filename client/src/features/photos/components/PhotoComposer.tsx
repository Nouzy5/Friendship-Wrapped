import { useEffect, useId, useState, type FormEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { fieldClasses, FieldMessage } from "../../../components/ui/field";
import { getDeviceSettings } from "../../../lib/device-settings";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import { useObjectUrl } from "../../../lib/useObjectUrl";
import type { Group } from "../../groups/types";
import { useUploadPhoto } from "../hooks";
import type { Photo } from "../types";

type NetworkInformation = EventTarget & { type?: string };
const connection = (): NetworkInformation | undefined => (navigator as Navigator & { connection?: NetworkInformation }).connection;

/** Settings → Photos & data → Upload on mobile data, where the browser can tell (mostly Android). */
function mustWaitForWifi(): boolean {
  return !getDeviceSettings().uploadOnMobileData && connection()?.type === "cellular";
}

/** Settings → Photos & data → Save to this device. */
function saveCopy(image: Blob) {
  const url = URL.createObjectURL(image);
  const link = document.createElement("a");
  link.href = url;
  link.download = `friendship-wrapped-${new Date().toISOString().slice(0, 10)}.jpg`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type PhotoComposerProps = {
  image: Blob;
  group: Group;
  discardLabel: string;
  onDiscard: () => void;
  onPosted: (photo: Photo) => void;
};

/** Preview → caption → post to the chosen group. */
export function PhotoComposer({ image, group, discardLabel, onDiscard, onPosted }: PhotoComposerProps) {
  const previewUrl = useObjectUrl(image);
  const upload = useUploadPhoto();
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [waitingForWifi, setWaitingForWifi] = useState(false);
  const captionId = useId();

  const captionError = getFieldErrors(upload.error).caption;
  const formError = getFormError(upload.error);

  function post() {
    setWaitingForWifi(false);
    setProgress(null);
    upload.mutate(
      { groupId: group.id, image, caption, onProgress: setProgress },
      {
        onSuccess: (photo) => {
          if (getDeviceSettings().saveToDevice) saveCopy(image);
          onPosted(photo);
        },
      },
    );
  }

  // Posts by itself once the phone is off mobile data.
  useEffect(() => {
    const network = connection();
    if (!waitingForWifi || !network) return;
    const onChange = () => {
      if (!mustWaitForWifi()) post();
    };
    network.addEventListener("change", onChange);
    return () => network.removeEventListener("change", onChange);
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mustWaitForWifi()) setWaitingForWifi(true);
    else post();
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex animate-page-fade flex-col gap-5" aria-label="Share photo">
      <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-[2.75rem] bg-black" style={{ maxWidth: "calc(100dvh - 21rem)" }}>
        {previewUrl && <img src={previewUrl} alt="Your photo" className="size-full object-cover" />}
        {upload.isPending && (
          <div
            role="progressbar"
            aria-label="Upload"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
            className="absolute inset-x-6 bottom-5 h-1.5 overflow-hidden rounded-full bg-white/30"
          >
            <div
              className={`h-full rounded-full bg-white transition-[width] ${progress === null ? "w-1/5 animate-pulse" : ""}`}
              style={progress === null ? undefined : { width: `${Math.max(4, progress * 100)}%` }}
            />
          </div>
        )}
      </div>

      {formError && <Alert>{formError}</Alert>}
      {waitingForWifi && (
        <Alert tone="success">
          You're on mobile data, so this will post when you're back on Wi-Fi. Keep this screen open, or{" "}
          <button type="button" onClick={post} className="font-semibold underline underline-offset-2">
            post it now
          </button>
          .
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={captionId} className="sr-only">
          Caption
        </label>
        <input
          id={captionId}
          name="caption"
          placeholder="Add a caption"
          maxLength={500}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          aria-invalid={captionError ? true : undefined}
          className={`${fieldClasses(Boolean(captionError))} rounded-full`}
        />
        {captionError && <FieldMessage id={`${captionId}-error`} error message={captionError} />}
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onDiscard} disabled={upload.isPending}>
          {discardLabel}
        </Button>
        <Button type="submit" variant="accent" className="flex-1" disabled={upload.isPending || waitingForWifi}>
          {upload.isPaused
            ? "Waiting for connection…"
            : waitingForWifi
              ? "Waiting for Wi-Fi…"
              : upload.isPending
                ? progress === null || progress >= 1
                  ? "Posting…"
                  : `Posting… ${Math.round(progress * 100)}%`
                : `Post to ${group.name}`}
        </Button>
      </div>
    </form>
  );
}

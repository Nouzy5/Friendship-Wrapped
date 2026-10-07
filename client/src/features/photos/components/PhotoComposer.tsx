import { useState, type FormEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { SelectField } from "../../../components/ui/SelectField";
import { TextField } from "../../../components/ui/TextField";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import { useObjectUrl } from "../../../lib/useObjectUrl";
import { GroupEmoji } from "../../groups/components/GroupEmoji";
import type { Group } from "../../groups/types";
import { useUploadPhoto } from "../hooks";
import type { Photo } from "../types";

type PhotoComposerProps = {
  image: Blob;
  groups: Group[];
  /** Preselected group, or null to make the person choose (when they're in several). */
  initialGroupId: string | null;
  discardLabel: string;
  onDiscard: () => void;
  onPosted: (photo: Photo) => void;
};

/** Preview → caption → choose group → post. */
export function PhotoComposer({ image, groups, initialGroupId, discardLabel, onDiscard, onPosted }: PhotoComposerProps) {
  const previewUrl = useObjectUrl(image);
  const upload = useUploadPhoto();
  const [caption, setCaption] = useState("");
  const [groupId, setGroupId] = useState(initialGroupId ?? "");
  const [groupError, setGroupError] = useState<string>();
  const [progress, setProgress] = useState<number | null>(null);

  const fieldErrors = getFieldErrors(upload.error);
  const formError = getFormError(upload.error);
  const onlyGroup = groups.length === 1 ? groups[0] : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupId) {
      setGroupError("Choose who to share this with");
      return;
    }
    setProgress(null);
    upload.mutate({ groupId, image, caption, onProgress: setProgress }, { onSuccess: onPosted });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5" aria-label="Share photo">
      <div className="overflow-hidden rounded-3xl bg-black">
        {/* Small enough that the caption and Post button fit on a phone screen too. */}
        {previewUrl && (
          <img src={previewUrl} alt="Your photo" className="max-h-[max(12rem,calc(100dvh-30rem))] w-full object-contain" />
        )}
      </div>

      {upload.isPending && (
        <div
          role="progressbar"
          aria-label="Upload"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
          className="-mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800"
        >
          <div
            className={`h-full rounded-full bg-linear-to-r from-brand-rose to-brand-orange transition-[width] ${
              progress === null ? "w-1/5 animate-pulse" : ""
            }`}
            style={progress === null ? undefined : { width: `${Math.max(4, progress * 100)}%` }}
          />
        </div>
      )}

      {formError && <Alert>{formError}</Alert>}

      <TextField
        label="Caption"
        name="caption"
        placeholder="Say something about it…"
        maxLength={500}
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
        error={fieldErrors.caption}
      />

      {onlyGroup ? (
        <p className="flex items-center gap-3 text-sm text-ink-200">
          <GroupEmoji emoji={onlyGroup.emoji} />
          <span>
            Sharing with <strong className="text-ink-50">{onlyGroup.name}</strong>
          </span>
        </p>
      ) : (
        <SelectField
          label="Share with"
          name="groupId"
          value={groupId}
          error={groupError}
          onChange={(event) => {
            setGroupId(event.target.value);
            setGroupError(undefined);
          }}
        >
          <option value="" disabled>
            Choose a group
          </option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.emoji} {group.name}
            </option>
          ))}
        </SelectField>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onDiscard} disabled={upload.isPending}>
          {discardLabel}
        </Button>
        <Button type="submit" className="flex-1" disabled={upload.isPending}>
          {upload.isPaused
            ? "Waiting for connection…"
            : upload.isPending
              ? progress === null || progress >= 1
                ? "Posting…"
                : `Posting… ${Math.round(progress * 100)}%`
              : "Post"}
        </Button>
      </div>
    </form>
  );
}

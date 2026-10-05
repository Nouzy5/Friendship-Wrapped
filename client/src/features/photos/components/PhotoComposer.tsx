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

  const fieldErrors = getFieldErrors(upload.error);
  const formError = getFormError(upload.error);
  const onlyGroup = groups.length === 1 ? groups[0] : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupId) {
      setGroupError("Choose who to share this with");
      return;
    }
    upload.mutate({ groupId, image, caption }, { onSuccess: onPosted });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5" aria-label="Share photo">
      <div className="overflow-hidden rounded-3xl bg-black">
        {previewUrl && <img src={previewUrl} alt="Your photo" className="max-h-[55dvh] w-full object-contain" />}
      </div>

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
          {upload.isPending ? "Posting…" : "Post"}
        </Button>
      </div>
    </form>
  );
}

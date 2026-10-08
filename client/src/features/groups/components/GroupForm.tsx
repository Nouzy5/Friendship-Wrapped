import { useState, type FormEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import type { GroupInput } from "../types";
import { EmojiPicker, PRESET_EMOJIS } from "./EmojiPicker";

type GroupFormProps = {
  initialValues?: GroupInput;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  error: unknown;
  /** Shown next to the submit button, e.g. "Saved". */
  statusMessage?: string;
  onSubmit: (input: GroupInput) => void;
  /** Called on any edit, e.g. to clear a previous "Saved" message. */
  onEdit?: () => void;
};

/** Name + emoji form shared by "create group" and "edit group". The server does the validation. */
export function GroupForm({
  initialValues,
  submitLabel,
  pendingLabel,
  isPending,
  error,
  statusMessage,
  onSubmit,
  onEdit,
}: GroupFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [emoji, setEmoji] = useState(initialValues?.emoji ?? PRESET_EMOJIS[0]!);

  const fieldErrors = getFieldErrors(error);
  const formError = getFormError(error);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ name, emoji });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      {formError && <Alert>{formError}</Alert>}

      <TextField
        label="Group name"
        name="name"
        autoComplete="off"
        maxLength={50}
        placeholder="e.g. The Boys"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          onEdit?.();
        }}
        error={fieldErrors.name}
      />

      <EmojiPicker
        value={emoji}
        onChange={(value) => {
          setEmoji(value);
          onEdit?.();
        }}
        error={fieldErrors.emoji}
      />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
        <p role="status" className="text-sm text-fg">
          {statusMessage}
        </p>
      </div>
    </form>
  );
}

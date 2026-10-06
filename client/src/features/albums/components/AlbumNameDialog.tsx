import { useState, type FormEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { TextField } from "../../../components/ui/TextField";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";

type AlbumNameDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initialName?: string;
  isPending: boolean;
  error: unknown;
  onSubmit: (name: string) => void;
};

/** Asks for an album's name, to create or rename it. */
export function AlbumNameDialog(props: AlbumNameDialogProps) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title={props.title}>
      {/* Mounted per opening, so the field starts from the current name each time. */}
      <AlbumNameForm {...props} />
    </Dialog>
  );
}

function AlbumNameForm({ onClose, submitLabel, initialName = "", isPending, error, onSubmit }: AlbumNameDialogProps) {
  const [name, setName] = useState(initialName);
  const formError = getFormError(error);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(name);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
      {formError && <Alert>{formError}</Alert>}
      <TextField
        label="Album name"
        name="name"
        placeholder="Summer trip 2026"
        maxLength={60}
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={getFieldErrors(error).name}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !name.trim()}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

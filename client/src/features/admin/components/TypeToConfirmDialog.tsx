import { useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { TextField } from "../../../components/ui/TextField";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";

type TypeToConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  /** What has to be typed for the button to work, like GitHub's "type the repository's name". */
  expected: string;
  confirmLabel: string;
  pendingLabel: string;
  isPending: boolean;
  error: unknown;
  onConfirm: (typed: string) => void;
};

/** For what can't be undone: the button stays off until the name has been typed out. */
export function TypeToConfirmDialog({
  open,
  onClose,
  title,
  description,
  expected,
  confirmLabel,
  pendingLabel,
  isPending,
  error,
  onConfirm,
}: TypeToConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === expected.trim().toLowerCase();

  function close() {
    setTyped("");
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (matches) onConfirm(typed);
  }

  return (
    <Dialog open={open} onClose={close} title={title} busy={isPending}>
      <form noValidate onSubmit={submit} className="mt-2 flex flex-col gap-4">
        <div className="text-[0.9375rem] wrap-anywhere text-sub">{description}</div>
        {getFormError(error) && <Alert>{getFormError(error)}</Alert>}
        <TextField
          label={`Type ${expected} to confirm`}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          error={getFieldErrors(error).confirm}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!matches || isPending}>
            {isPending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

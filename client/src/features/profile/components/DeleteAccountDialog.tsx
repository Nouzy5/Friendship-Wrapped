import { useState, type FormEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { TextField } from "../../../components/ui/TextField";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import { useDeleteAccount } from "../hooks";

/** Spells out what goes, then deletes the account once the password confirms it. */
export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const remove = useDeleteAccount();
  const [password, setPassword] = useState("");

  const fieldErrors = getFieldErrors(remove.error);
  const formError = getFormError(remove.error);

  function close() {
    setPassword("");
    remove.reset();
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    remove.mutate(password);
  }

  return (
    <Dialog open={open} onClose={close} title="Delete your account?" busy={remove.isPending}>
      <form noValidate onSubmit={handleSubmit} className="mt-2 flex min-h-0 flex-col gap-4 overflow-y-auto text-sm text-ink-200">
        <p>This can't be undone. It permanently deletes:</p>
        <ul className="-mt-2 list-disc space-y-1 pl-5">
          <li>every photo you've posted, with the reactions and comments on them</li>
          <li>your own comments, reactions and favorites</li>
          <li>your profile and profile picture</li>
        </ul>
        <p>
          You'll leave all your groups. A group you own passes to whoever has been in it longest, and a group with no one
          else in it is deleted. Albums you made stay with their group.
        </p>

        <TextField
          label="Your password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
        />
        {formError && <Alert>{formError}</Alert>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={remove.isPending || !password}>
            {remove.isPending ? "Deleting…" : "Delete account"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

import { useState, type FormEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import type { User } from "../../auth/types";
import { useUpdateProfile } from "../hooks";

export function EditProfileForm({ user }: { user: User }) {
  const update = useUpdateProfile();
  const [displayName, setDisplayName] = useState(user.displayName);

  const fieldErrors = getFieldErrors(update.error);
  const formError = getFormError(update.error);
  const unchanged = displayName.trim() === user.displayName;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update.mutate({ displayName }, { onSuccess: (saved) => setDisplayName(saved.displayName) });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4" aria-labelledby="edit-profile-heading">
      <h2 id="edit-profile-heading" className="text-sm font-semibold tracking-wide text-ink-200 uppercase">
        Edit profile
      </h2>

      {formError && <Alert>{formError}</Alert>}

      <TextField
        label="Display name"
        name="displayName"
        autoComplete="nickname"
        maxLength={40}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        error={fieldErrors.displayName}
        hint="This is how your friends will see you."
      />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={unchanged || update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
        <p role="status" className="text-sm text-success">
          {update.isSuccess && unchanged ? "Saved" : ""}
        </p>
      </div>
    </form>
  );
}

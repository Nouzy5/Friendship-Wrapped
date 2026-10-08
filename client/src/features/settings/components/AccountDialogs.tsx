import { useState, type FormEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { TextField } from "../../../components/ui/TextField";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import { toast } from "../../../lib/toast";
import type { User } from "../../auth/types";
import { useUpdateProfile } from "../../profile/hooks";
import { useChangePassword, useUpdateUsername } from "../hooks";

type DialogProps = { open: boolean; onClose: () => void; user: User };

function DialogButtons({ pending, pendingLabel, label, disabled, onCancel }: { pending: boolean; pendingLabel: string; label: string; disabled: boolean; onCancel: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending || disabled}>
        {pending ? pendingLabel : label}
      </Button>
    </div>
  );
}

export function DisplayNameDialog({ open, onClose, user }: DialogProps) {
  const update = useUpdateProfile();
  const [value, setValue] = useState(user.displayName);
  const close = () => {
    setValue(user.displayName);
    update.reset();
    onClose();
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    update.mutate({ displayName: value }, { onSuccess: () => (toast("Name saved"), onClose()) });
  }

  return (
    <Dialog open={open} onClose={close} title="Display name">
      <form noValidate onSubmit={submit} className="mt-3 flex flex-col gap-4">
        {getFormError(update.error) && <Alert>{getFormError(update.error)}</Alert>}
        <TextField
          label="Name"
          autoComplete="nickname"
          maxLength={40}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={getFieldErrors(update.error).displayName}
          hint="This is how your friends see you."
        />
        <DialogButtons pending={update.isPending} pendingLabel="Saving…" label="Save" disabled={!value.trim() || value.trim() === user.displayName} onCancel={close} />
      </form>
    </Dialog>
  );
}

export function UsernameDialog({ open, onClose, user }: DialogProps) {
  const update = useUpdateUsername();
  const [value, setValue] = useState(user.username);
  const close = () => {
    setValue(user.username);
    update.reset();
    onClose();
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    update.mutate(value, { onSuccess: () => (toast("Username saved"), onClose()) });
  }

  return (
    <Dialog open={open} onClose={close} title="Username">
      <form noValidate onSubmit={submit} className="mt-3 flex flex-col gap-4">
        {getFormError(update.error) && <Alert>{getFormError(update.error)}</Alert>}
        <TextField
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={getFieldErrors(update.error).username}
          hint="You sign in with it. Letters, numbers, periods and underscores."
        />
        <DialogButtons pending={update.isPending} pendingLabel="Saving…" label="Save" disabled={!value.trim() || value.trim().toLowerCase() === user.username} onCancel={close} />
      </form>
    </Dialog>
  );
}

export function PasswordDialog({ open, onClose }: Omit<DialogProps, "user">) {
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const errors = getFieldErrors(change.error);
  const close = () => {
    setCurrentPassword("");
    setNewPassword("");
    change.reset();
    onClose();
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    change.mutate({ currentPassword, newPassword }, { onSuccess: () => (toast("Password changed. Your other devices are signed out."), close()) });
  }

  return (
    <Dialog open={open} onClose={close} title="Change password">
      <form noValidate onSubmit={submit} className="mt-3 flex flex-col gap-4">
        {getFormError(change.error) && <Alert>{getFormError(change.error)}</Alert>}
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          error={errors.currentPassword}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={errors.newPassword}
          hint="At least 8 characters. Other devices will be signed out."
        />
        <DialogButtons pending={change.isPending} pendingLabel="Changing…" label="Change password" disabled={!currentPassword || !newPassword} onCancel={close} />
      </form>
    </Dialog>
  );
}

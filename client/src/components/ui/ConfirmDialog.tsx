import type { ReactNode } from "react";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "danger";
  isPending?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
};

/** "Are you sure?" before something that can't be undone. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel = "Working…",
  variant = "primary",
  isPending = false,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="mt-2 text-sm text-ink-200">{description}</div>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button variant={variant} onClick={onConfirm} disabled={isPending}>
          {isPending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

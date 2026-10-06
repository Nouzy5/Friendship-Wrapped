import { useId, type ReactNode } from "react";
import { useModal } from "../../lib/useModal";
import { Alert } from "./Alert";
import { Button } from "./Button";

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

/** Modal confirmation built on <dialog>, which provides focus trapping and Escape-to-close. */
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
  const ref = useModal(open);
  const titleId = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(calc(100%-2rem),24rem)] rounded-3xl border border-ink-700 bg-ink-900 p-6 text-ink-50 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <h2 id={titleId} className="text-lg font-bold">
        {title}
      </h2>
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
    </dialog>
  );
}

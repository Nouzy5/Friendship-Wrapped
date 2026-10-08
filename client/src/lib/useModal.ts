import { useEffect, useRef } from "react";

/**
 * Opens and closes a <dialog> as a modal to match `open`. The browser then traps focus
 * inside it, closes it on Escape (handle its `onClose`), and returns focus afterwards.
 */
export function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Reopened while still animating shut: finish that first, or the browser still counts it as shown.
      for (const animation of dialog.getAnimations()) animation.finish();
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return ref;
}

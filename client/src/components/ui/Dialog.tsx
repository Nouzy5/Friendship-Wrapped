import { useId, useRef, type MouseEvent, type ReactNode } from "react";
import { useModal } from "../../lib/useModal";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Wider and taller, for content like a photo picker. */
  size?: "sm" | "lg";
  /**
   * While its action is being saved, Escape and the backdrop don't close it: what happens
   * next (going back, a toast, showing an error) would be lost with it.
   */
  busy?: boolean;
};

/** True for a pointer on the backdrop: the <dialog> itself, outside the card's box. */
function isOnBackdrop(event: MouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== event.currentTarget) return false;
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}

const sizeClasses = {
  sm: "w-[min(calc(100%-2rem),24rem)] max-h-[85dvh]",
  lg: "w-[min(calc(100%-1rem),28rem)] max-h-[92dvh]",
};

/**
 * A modal card with a title, built on <dialog>: the browser traps focus inside it,
 * Escape closes it (calling `onClose`), and focus returns to where it was afterwards.
 */
export function Dialog({ open, onClose, title, children, size = "sm", busy = false }: DialogProps) {
  const ref = useModal(open);
  const titleId = useId();
  const pressedBackdrop = useRef(false);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      // A tap on the backdrop (outside the card) closes it too. Only one that both starts
      // and ends there: clicks made with the keyboard (Enter on a button, Space on a
      // checkbox) report no position, and a text selection can end outside the card.
      onPointerDown={(event) => {
        pressedBackdrop.current = isOnBackdrop(event);
      }}
      onClick={(event) => {
        const tappedBackdrop = pressedBackdrop.current && isOnBackdrop(event);
        pressedBackdrop.current = false;
        if (tappedBackdrop && !busy) event.currentTarget.close();
      }}
      className={`m-auto flex-col overflow-hidden rounded-3xl border border-ink-700 bg-ink-900 p-6 text-ink-50 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm open:flex ${sizeClasses[size]}`}
    >
      <h2 id={titleId} className="text-lg font-bold wrap-anywhere">
        {title}
      </h2>
      {open && children}
    </dialog>
  );
}

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
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
 * Escape and backdrop taps go through `onClose` (the parent's state) rather than closing the
 * element directly, so open and closed never get out of step while it animates.
 */
export function Dialog({ open, onClose, title, children, size = "sm", busy = false }: DialogProps) {
  const ref = useModal(open);
  const titleId = useId();
  const pressedBackdrop = useRef(false);
  // The content stays while the dialog animates shut, then goes (so forms start fresh next time).
  const [rendered, setRendered] = useState(open);
  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    const timer = window.setTimeout(() => setRendered(false), 260);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
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
        if (tappedBackdrop && !busy) onClose();
      }}
      className={`m-auto flex-col overflow-hidden rounded-[1.75rem] bg-bg p-6 text-fg shadow-2xl transition-[opacity,scale,translate,display,overlay] transition-discrete duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)] not-open:translate-y-4 not-open:scale-95 not-open:opacity-0 open:flex starting:open:translate-y-4 starting:open:scale-95 starting:open:opacity-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm backdrop:transition-[background-color,backdrop-filter,display,overlay] backdrop:transition-discrete backdrop:duration-250 not-open:backdrop:bg-black/0 not-open:backdrop:backdrop-blur-none starting:open:backdrop:bg-black/0 starting:open:backdrop:backdrop-blur-none ${sizeClasses[size]}`}
    >
      <h2 id={titleId} className="text-xl font-semibold font-stretch-112% wrap-anywhere">
        {title}
      </h2>
      {(open || rendered) && children}
    </dialog>
  );
}

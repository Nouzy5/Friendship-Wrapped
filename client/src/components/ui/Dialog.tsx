import { useId, type ReactNode } from "react";
import { useModal } from "../../lib/useModal";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Wider and taller, for content like a photo picker. */
  size?: "sm" | "lg";
};

const sizeClasses = {
  sm: "w-[min(calc(100%-2rem),24rem)] max-h-[85dvh]",
  lg: "w-[min(calc(100%-1rem),28rem)] max-h-[92dvh]",
};

/**
 * A modal card with a title, built on <dialog>: the browser traps focus inside it,
 * Escape closes it (calling `onClose`), and focus returns to where it was afterwards.
 */
export function Dialog({ open, onClose, title, children, size = "sm" }: DialogProps) {
  const ref = useModal(open);
  const titleId = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // A tap on the backdrop (outside the card) closes it too.
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
        if (outside) event.currentTarget.close();
      }}
      className={`m-auto flex-col overflow-hidden rounded-3xl border border-ink-700 bg-ink-900 p-6 text-ink-50 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm open:flex ${sizeClasses[size]}`}
    >
      <h2 id={titleId} className="text-lg font-bold">
        {title}
      </h2>
      {open && children}
    </dialog>
  );
}

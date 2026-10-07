import { dismissToast, useToasts } from "../lib/toast";
import { CloseIcon } from "./ui/icons";

/**
 * Where toasts appear: above the navigation bar, over everything. The live region is
 * always there (empty when quiet), so screen readers announce each message.
 */
export function Toaster() {
  const toasts = useToasts();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto flex w-full max-w-sm animate-rise items-center gap-2 rounded-2xl border py-2 pr-2 pl-4 text-sm font-medium shadow-xl shadow-black/40 backdrop-blur motion-reduce:animate-none ${
            item.tone === "error" ? "border-danger/40 bg-ink-900/95 text-danger" : "border-ink-700 bg-ink-800/95 text-ink-50"
          }`}
        >
          <span className="min-w-0 flex-1">{item.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(item.id)}
            aria-label="Dismiss"
            className="grid size-10 shrink-0 place-items-center rounded-full text-ink-400 transition hover:bg-ink-700 hover:text-ink-50"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

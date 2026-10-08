import { dismissToast, useToasts } from "../lib/toast";
import { AlertIcon, CloseIcon } from "./ui/icons";

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
          className="pointer-events-auto flex w-full max-w-sm animate-rise items-center gap-2.5 rounded-full bg-inverse py-1.5 pr-1.5 pl-5 text-[0.9375rem] font-medium text-on-inverse shadow-lg shadow-black/20 motion-reduce:animate-none"
        >
          {item.tone === "error" && <AlertIcon className="size-5 shrink-0" />}
          <span className="min-w-0 flex-1">{item.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(item.id)}
            aria-label="Dismiss"
            className="grid size-10 shrink-0 place-items-center rounded-full opacity-70 transition hover:opacity-100"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

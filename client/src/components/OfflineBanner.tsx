import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Says so while the device is offline. Loading and saving wait for the connection
 * (TanStack Query pauses them) and carry on by themselves when it's back.
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine);

  return (
    <div role="status" aria-live="polite">
      {!online && (
        <p className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-20 bg-warning px-4 py-1.5 text-center text-sm font-semibold text-ink-950">
          You're offline. Anything you do will be sent when you're back.
        </p>
      )}
    </div>
  );
}

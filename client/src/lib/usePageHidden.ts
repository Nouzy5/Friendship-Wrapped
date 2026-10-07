import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** True while the tab is in the background or the phone is locked. */
export function usePageHidden(): boolean {
  return useSyncExternalStore(subscribe, () => document.hidden);
}

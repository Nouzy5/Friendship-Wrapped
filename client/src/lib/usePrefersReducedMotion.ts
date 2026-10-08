import { useSyncExternalStore } from "react";
import { useDeviceSettings } from "./device-settings";

const query = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * For motion driven from script; CSS animations use the motion-reduce: variant instead.
 * Settings → Appearance → Reduce motion can override the device either way.
 */
export function usePrefersReducedMotion(): boolean {
  const { reduceMotion } = useDeviceSettings();
  const deviceReduces = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
  if (reduceMotion === "system") return deviceReduces;
  return reduceMotion === "on";
}

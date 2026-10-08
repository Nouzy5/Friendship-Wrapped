import { getDeviceSettings } from "./device-settings";

/**
 * A small tap when you react or take a photo (Settings → Appearance → Haptics). Browsers that
 * can't vibrate (iPhone Safari among them) simply do nothing.
 */
export function haptic(): void {
  if (!getDeviceSettings().haptics) return;
  navigator.vibrate?.(12);
}

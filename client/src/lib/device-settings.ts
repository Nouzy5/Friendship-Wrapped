import { useSyncExternalStore } from "react";

/**
 * Settings that belong to this device rather than the account: how the app looks and feels here,
 * and how this phone's camera and connection are used. Kept in localStorage; account settings
 * (privacy, notifications) live on the server.
 */
export type DeviceSettings = {
  theme: "system" | "light" | "dark";
  appIcon: "classic" | "night" | "yours";
  reduceMotion: "system" | "on" | "off";
  haptics: boolean;
  /** Which camera the camera screen opens with. */
  cameraFacing: "environment" | "user";
  mirrorFrontCamera: boolean;
  cameraGrid: boolean;
  /** Download a copy of each photo you post. */
  saveToDevice: boolean;
  photoQuality: "standard" | "high";
  /** When off, photos taken on mobile data wait for Wi-Fi (where the browser can tell). */
  uploadOnMobileData: boolean;
  /** Smaller photos everywhere. */
  dataSaver: boolean;
};

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  theme: "system",
  appIcon: "classic",
  reduceMotion: "system",
  haptics: true,
  cameraFacing: "environment",
  mirrorFrontCamera: true,
  cameraGrid: false,
  saveToDevice: false,
  photoQuality: "standard",
  uploadOnMobileData: true,
  dataSaver: false,
};

/** Also read by the inline script in index.html, so keep the key and the `theme` field in step with it. */
export const DEVICE_SETTINGS_KEY = "fw.device-settings";

const listeners = new Set<() => void>();
let current: DeviceSettings = read();

function read(): DeviceSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(DEVICE_SETTINGS_KEY) ?? "{}") as Partial<DeviceSettings>;
    return { ...DEFAULT_DEVICE_SETTINGS, ...stored };
  } catch {
    // Private mode, blocked storage or a corrupt value: fall back to the defaults.
    return DEFAULT_DEVICE_SETTINGS;
  }
}

export function getDeviceSettings(): DeviceSettings {
  return current;
}

export function updateDeviceSettings(changes: Partial<DeviceSettings>): void {
  current = { ...current, ...changes };
  try {
    localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify(current));
  } catch {
    // Still applies for this visit.
  }
  listeners.forEach((listener) => listener());
}

/** Back to the defaults, e.g. after deleting the account on a shared computer. */
export function resetDeviceSettings(): void {
  try {
    localStorage.removeItem(DEVICE_SETTINGS_KEY);
  } catch {
    // Nothing stored.
  }
  current = DEFAULT_DEVICE_SETTINGS;
  listeners.forEach((listener) => listener());
}

export function subscribeToDeviceSettings(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed them.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== DEVICE_SETTINGS_KEY) return;
    current = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDeviceSettings(): DeviceSettings {
  return useSyncExternalStore(subscribeToDeviceSettings, getDeviceSettings);
}

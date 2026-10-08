import { useSyncExternalStore } from "react";
import { getDeviceSettings, useDeviceSettings } from "./device-settings";

const darkQuery = "(prefers-color-scheme: dark)";

function subscribeToDarkMode(onChange: () => void) {
  const media = window.matchMedia(darkQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const deviceIsDark = () => window.matchMedia(darkQuery).matches;

/** Whether the phone or computer itself is in dark mode right now. */
export function useDeviceIsDark(): boolean {
  return useSyncExternalStore(subscribeToDarkMode, deviceIsDark);
}

/** The theme actually on screen: the setting, or the device's own when it's "Match device". */
export function useResolvedTheme(): "light" | "dark" {
  const { theme } = useDeviceSettings();
  const isDark = useDeviceIsDark();
  if (theme === "system") return isDark ? "dark" : "light";
  return theme;
}

/** The browser's address bar and the installed app's status bar follow the page background. */
const THEME_COLORS = { light: "#ffffff", dark: "#000000" } as const;

function applyAppearance() {
  const { theme, reduceMotion } = getDeviceSettings();
  const resolved = theme === "system" ? (deviceIsDark() ? "dark" : "light") : theme;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  if (reduceMotion === "system") delete root.dataset.motion;
  else root.dataset.motion = reduceMotion === "on" ? "reduce" : "full";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[resolved]);
}

/**
 * Keeps <html data-theme data-motion> in step with the settings and the device. index.html sets the
 * theme before the first paint; this takes over once the app runs.
 */
export function startAppearance(subscribeToSettings: (listener: () => void) => () => void): void {
  applyAppearance();
  subscribeToSettings(crossfadeAppearance);
  subscribeToDarkMode(crossfadeAppearance);
}

function wantsLessMotion(): boolean {
  const { reduceMotion } = getDeviceSettings();
  if (reduceMotion !== "system") return reduceMotion === "on";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A change of theme crossfades the whole screen (where the browser has view transitions). */
function crossfadeAppearance() {
  const { theme } = getDeviceSettings();
  const next = theme === "system" ? (deviceIsDark() ? "dark" : "light") : theme;
  const changing = document.documentElement.dataset.theme !== next;
  if (changing && document.startViewTransition && !wantsLessMotion()) document.startViewTransition(applyAppearance);
  else applyAppearance();
}

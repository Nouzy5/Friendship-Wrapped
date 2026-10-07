import { useSyncExternalStore } from "react";

export type Toast = { id: number; message: string; tone: "info" | "error" };

const SHOW_MS = { info: 3500, error: 6000 };
/** Older toasts make way beyond this many. */
const MAX_TOASTS = 3;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** A short message above the navigation bar, e.g. "Photo deleted" or a failed tap. */
export function toast(message: string, tone: Toast["tone"] = "info"): void {
  const id = nextId++;
  // The same message again (e.g. several failed taps) replaces the old one.
  toasts = [...toasts.filter((existing) => existing.message !== message), { id, message, tone }].slice(-MAX_TOASTS);
  emit();
  window.setTimeout(() => dismissToast(id), SHOW_MS[tone]);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((existing) => existing.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => toasts);
}

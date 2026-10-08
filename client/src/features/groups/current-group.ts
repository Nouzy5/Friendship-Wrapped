import { useEffect, useSyncExternalStore } from "react";
import { applyAccent } from "../../lib/member-colors";
import { useMyGroups } from "./hooks";
import type { Group } from "./types";

/**
 * The group you last looked at: Home opens it, the camera posts to it, Memories shows it, and
 * your colour in it is the app's accent. Remembered on this device.
 */
const KEY = "fw.current-group";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let currentId = read();

export function setCurrentGroupId(groupId: string): void {
  if (groupId === currentId) return;
  currentId = groupId;
  try {
    localStorage.setItem(KEY, groupId);
  } catch {
    // Remembered for this visit only.
  }
  listeners.forEach((listener) => listener());
}

/** On sign-out, so the next person on this device doesn't start in your group (or your colour). */
export function forgetCurrentGroup(): void {
  currentId = null;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem("fw.accent");
  } catch {
    // Nothing stored.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Your current group: the remembered one while you're still in it, else your first group.
 * `undefined` while your groups load, `null` when you have none.
 */
export function useCurrentGroup(): Group | null | undefined {
  const rememberedId = useSyncExternalStore(subscribe, () => currentId);
  const groups = useMyGroups();
  if (!groups.data) return undefined;
  return groups.data.find((group) => group.id === rememberedId) ?? groups.data[0] ?? null;
}

/** Paints the app's accent in your colour in the current group. */
export function useAccentFromCurrentGroup(): void {
  const group = useCurrentGroup();
  const loading = group === undefined;
  const color = group?.myColor;
  // While your groups load, keep the colour index.html painted from last time.
  useEffect(() => {
    if (!loading) applyAccent(color);
  }, [loading, color]);
}

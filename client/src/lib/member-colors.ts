import type { CSSProperties } from "react";

/** Everyone in a group has one of these; no two people in a group share one. Palette order matters (new members get the first free one). */
export const MEMBER_COLORS = [
  "LIME",
  "COBALT",
  "TOMATO",
  "SUN",
  "BUBBLEGUM",
  "MINT",
  "LILAC",
  "PLUM",
  "SKY",
  "FOREST",
  "TANGERINE",
  "CHERRY",
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number];

/** `ink` is the text colour that reads on the fill (at least 4.5:1). */
export const MEMBER_PALETTE: Record<MemberColor, { name: string; hex: string; ink: "#000000" | "#ffffff" }> = {
  LIME: { name: "Lime", hex: "#b6ee3a", ink: "#000000" },
  COBALT: { name: "Cobalt", hex: "#3355ff", ink: "#ffffff" },
  TOMATO: { name: "Tomato", hex: "#ff5533", ink: "#000000" },
  SUN: { name: "Sun", hex: "#ffc629", ink: "#000000" },
  BUBBLEGUM: { name: "Bubblegum", hex: "#ff9edb", ink: "#000000" },
  MINT: { name: "Mint", hex: "#35d6a5", ink: "#000000" },
  LILAC: { name: "Lilac", hex: "#b49bff", ink: "#000000" },
  PLUM: { name: "Plum", hex: "#8e3bd9", ink: "#ffffff" },
  SKY: { name: "Sky", hex: "#5bc8f5", ink: "#000000" },
  FOREST: { name: "Forest", hex: "#1a7a50", ink: "#ffffff" },
  TANGERINE: { name: "Tangerine", hex: "#ff9a1f", ink: "#000000" },
  CHERRY: { name: "Cherry", hex: "#c2185b", ink: "#ffffff" },
};

/** Before anyone has picked, and for people who have left the group. */
const NO_COLOR = { background: "var(--switch-off)", ink: "var(--fg)" };

export function memberFill(color: MemberColor | null | undefined): { background: string; ink: string } {
  if (!color) return NO_COLOR;
  const swatch = MEMBER_PALETTE[color];
  return { background: swatch.hex, ink: swatch.ink };
}

/** Inline style for anything filled with a person's colour: avatars, name tags, stripes. */
export function memberStyle(color: MemberColor | null | undefined): CSSProperties {
  const { background, ink } = memberFill(color);
  return { backgroundColor: background, color: ink };
}

/** Your colour in the group you're looking at becomes the app's accent (shutter, switches, your reactions). */
export function applyAccent(color: MemberColor | null | undefined): void {
  const swatch = MEMBER_PALETTE[color ?? "COBALT"];
  const root = document.documentElement.style;
  root.setProperty("--accent", swatch.hex);
  root.setProperty("--on-accent", swatch.ink);
  // index.html paints it before the app loads next time, so the shutter doesn't flash another colour.
  try {
    localStorage.setItem("fw.accent", JSON.stringify([swatch.hex, swatch.ink]));
  } catch {
    // Only this visit, then.
  }
}

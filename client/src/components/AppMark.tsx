import { MEMBER_PALETTE } from "../lib/member-colors";

const STRIPES = [MEMBER_PALETTE.LIME, MEMBER_PALETTE.COBALT, MEMBER_PALETTE.TOMATO, MEMBER_PALETTE.SUN, MEMBER_PALETTE.BUBBLEGUM];

/** The app's icon: five friends' colours side by side. Decorative. */
export function AppMark({ size }: { size: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 overflow-hidden" style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}>
      {STRIPES.map((swatch) => (
        <span key={swatch.hex} className="flex-1" style={{ background: swatch.hex }} />
      ))}
    </span>
  );
}

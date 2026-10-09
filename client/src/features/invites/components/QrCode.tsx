import { useMemo } from "react";
import { encode } from "uqr";

/** Scanners need a blank margin of four modules around the code. */
const QUIET_ZONE = 4;

/** One path for the whole code: each horizontal run of dark modules is a single rectangle. */
function modulesPath(rows: boolean[][]): string {
  let path = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      path += `M${start} ${y}h${x - start}v1h-${x - start}z`;
    }
  });
  return path;
}

/**
 * A QR code for `value`. It is always black on white, whatever the theme: scanners expect
 * dark modules on a light ground, and inverted codes don't read reliably.
 */
export function QrCode({ value, label, size = 192 }: { value: string; label: string; size?: number }) {
  const { path, modules } = useMemo(() => {
    const { data, size: modules } = encode(value, { ecc: "M", border: 0 });
    return { path: modulesPath(data), modules };
  }, [value]);
  const span = modules + QUIET_ZONE * 2;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${span} ${span}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-2xl bg-white"
    >
      <path d={path} fill="#000" />
    </svg>
  );
}

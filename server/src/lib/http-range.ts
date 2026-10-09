/** A byte range of a file of known size, both ends included. */
export type ByteRange = { start: number; end: number };

/**
 * What to send for a `Range` request header, for a file of `size` bytes (RFC 9110):
 * - `null`: the whole file (no header, another unit, several ranges, or nonsense: all are
 *   to be ignored, not refused).
 * - `"unsatisfiable"`: a well-formed range that starts past the end, answered with 416.
 * - otherwise the one range, with an end past the file's cut back to its last byte.
 */
export function parseRange(header: string | undefined, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;

  const [, first = "", last = ""] = match;
  if (first === "" && last === "") return null;

  // "-500": the last 500 bytes.
  if (first === "") {
    const count = Number(last);
    if (count === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - count), end: size - 1 };
  }

  const start = Number(first);
  if (start >= size) return "unsatisfiable";
  if (last === "") return { start, end: size - 1 };

  const end = Number(last);
  if (end < start) return null; // not a valid range: ignored
  return { start, end: Math.min(end, size - 1) };
}

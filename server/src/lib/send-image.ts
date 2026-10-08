import type { Response } from "express";
import { pipeline } from "node:stream/promises";
import type { StoredObject } from "./storage.js";

/**
 * Streams a stored image to the client. Image URLs never change content (photo
 * renditions are immutable, avatar URLs are versioned), so browsers may cache them —
 * but only privately, never in shared proxies.
 */
export async function sendImage(
  res: Response,
  image: StoredObject,
  { downloadName }: { downloadName?: string } = {},
): Promise<void> {
  res.set({
    "Content-Type": image.contentType ?? "application/octet-stream",
    "Cache-Control": "private, max-age=31536000, immutable",
  });
  if (downloadName) {
    // Saving is a permission that can be withdrawn, so a download is never cached.
    res.set({ "Content-Disposition": `attachment; filename="${downloadName}"`, "Cache-Control": "no-store" });
  }
  if (image.contentLength !== undefined) res.set("Content-Length", String(image.contentLength));

  try {
    await pipeline(image.body, res);
  } catch (error) {
    // The browser went away mid-download (e.g. scrolled past a thumbnail): nothing to report.
    if ((error as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE") return;
    throw error;
  }
}

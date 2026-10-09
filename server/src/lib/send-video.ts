import type { Response } from "express";
import { pipeline } from "node:stream/promises";
import type { ByteRange } from "./http-range.js";
import type { StoredObject } from "./storage.js";

/**
 * Streams a stored video, or the part of it that was asked for. Browsers and phones fetch
 * videos in pieces (`Range`), and seeking is a new request for another piece, so a video that
 * only came back whole could not be scrubbed through, nor start before it had all arrived.
 * Like photos, a video never changes, so it may be cached, but only privately.
 */
export async function sendVideo(
  res: Response,
  video: StoredObject,
  { size, range, downloadName }: { size: number; range: ByteRange | null; downloadName?: string },
): Promise<void> {
  res.status(range ? 206 : 200);
  res.set({
    "Content-Type": video.contentType ?? "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  });
  if (range) res.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  res.set("Content-Length", String(range ? range.end - range.start + 1 : size));
  if (downloadName) {
    // Saving is a permission that can be withdrawn, so a download is never cached.
    res.set({ "Content-Disposition": `attachment; filename="${downloadName}"`, "Cache-Control": "no-store" });
  }

  try {
    await pipeline(video.body, res);
  } catch (error) {
    // The player went away mid-download (it seeked, or the person scrolled on): nothing to report.
    if ((error as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE") return;
    throw error;
  }
}

/** The answer to a range that starts past the end of the video. */
export function sendUnsatisfiableRange(res: Response, size: number): void {
  res.status(416).set({ "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" }).end();
}

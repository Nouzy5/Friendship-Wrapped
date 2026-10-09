import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppError } from "../../lib/errors.js";
import { convertVideo, extractPoster, MAX_VIDEO_SECONDS, MediaToolError, probeVideo, videoSupported } from "../../lib/ffmpeg.js";
import { processPhoto, type PhotoVariant, type ProcessedImage } from "../../lib/images.js";
import { logger } from "../../lib/logger.js";

/** ~36 megapixels: a 6K frame. Larger is refused before it is decoded for conversion. */
const MAX_VIDEO_PIXELS = 36_000_000;

const unsupportedVideo = () =>
  new AppError(415, "UNSUPPORTED_VIDEO", "That file isn't a video we can use. Try an MP4 or a video from your phone.");

/**
 * The first bytes of a file must look like a video container: an MP4/MOV (a box such as `ftyp`,
 * or one of the older QuickTime ones) or WebM/Matroska. Checked by content, never by file name
 * or the browser's MIME type, and before ffmpeg sees the file: ffmpeg also understands playlists
 * and scripts that name other files and addresses, which an upload must never be able to use.
 */
async function assertVideoContainer(path: string): Promise<void> {
  const file = await open(path, "r");
  try {
    const head = Buffer.alloc(12);
    const { bytesRead } = await file.read(head, 0, 12, 0);
    if (bytesRead < 12) throw unsupportedVideo();
    const isMp4Family = ["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"].includes(head.toString("latin1", 4, 8));
    const isMatroska = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    if (!isMp4Family && !isMatroska) throw unsupportedVideo();
  } finally {
    await file.close();
  }
}

export type PreparedVideo = {
  /** The video's poster frame (or the still sent with it) as the three images every post has. */
  renditions: Record<PhotoVariant, ProcessedImage>;
  /** The converted MP4, in a temporary folder. */
  file: string;
  sizeBytes: number;
  durationMs: number;
  /** Deletes the temporary folder. Call it when done, however it went. */
  discard: () => Promise<void>;
};

/**
 * Checks an uploaded video and turns it into what is stored: a small MP4 plus its poster
 * frame as the usual three renditions. `still` is a picture sent with it (a Live Photo's
 * still); without one, a frame from the video is the poster. The upload itself is not kept.
 */
export async function prepareVideo(upload: { path: string }, still: Buffer | undefined): Promise<PreparedVideo> {
  if (!(await videoSupported())) {
    throw new AppError(503, "VIDEO_UNAVAILABLE", "Videos can't be posted on this server yet.");
  }
  await assertVideoContainer(upload.path);

  let source;
  try {
    source = await probeVideo(upload.path);
  } catch (error) {
    logger.warn("Rejected an upload ffprobe couldn't read", error);
    throw unsupportedVideo();
  }
  if (!source.hasVideo || source.durationMs <= 0) throw unsupportedVideo();
  if (source.durationMs > MAX_VIDEO_SECONDS * 1000 + 500) {
    throw new AppError(413, "VIDEO_TOO_LONG", `Videos can be at most ${MAX_VIDEO_SECONDS} seconds.`);
  }
  if (source.width * source.height > MAX_VIDEO_PIXELS) {
    throw new AppError(413, "VIDEO_TOO_LARGE", "That video's resolution is too high.");
  }

  const folder = await mkdtemp(join(tmpdir(), "fw-video-"));
  const discard = () => rm(folder, { recursive: true, force: true });
  try {
    const file = join(folder, "video.mp4");
    try {
      await convertVideo(upload.path, file);
    } catch (error) {
      if (error instanceof MediaToolError) logger.warn(`Couldn't convert an uploaded video: ${error.message}\n${error.output}`);
      throw unsupportedVideo();
    }
    const converted = await probeVideo(file);

    let poster = still;
    if (!poster) {
      const posterFile = join(folder, "poster.jpg");
      // A moment in, past a fade-in from black, but never past the end.
      await extractPoster(file, posterFile, Math.min(1, converted.durationMs / 2000));
      poster = await readFile(posterFile);
    }
    const renditions = await processPhoto(poster);

    return { renditions, file, sizeBytes: (await stat(file)).size, durationMs: converted.durationMs, discard };
  } catch (error) {
    await discard();
    throw error;
  }
}

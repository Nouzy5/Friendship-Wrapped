import { IMAGE_ACCEPT, imageFileError } from "./image-files";

/** Video types phones and browsers produce. The server checks what a file really is, whatever it's called. */
export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,video/3gpp";

/** What the gallery button offers: photos and short videos. */
export const MEDIA_ACCEPT = `${IMAGE_ACCEPT},${VIDEO_ACCEPT}`;

/** Mirror the server's limits, so a file that can't be posted fails fast instead of after uploading. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;

export function isVideoFile(file: Pick<File, "type">): boolean {
  return file.type.startsWith("video/");
}

/** A quick client-side check for instant feedback on a photo or video. The server validates every upload regardless. */
export function mediaFileError(file: File): string | null {
  if (!isVideoFile(file)) return imageFileError(file);
  if (!VIDEO_ACCEPT.split(",").includes(file.type)) return "That file isn't a supported video. Use an MP4 or a video from your phone.";
  if (file.size > MAX_VIDEO_BYTES) return "Videos can be at most 100 MB.";
  return null;
}

/** How long a video is, in seconds, if this browser can read it (it can't always, e.g. for a codec it doesn't play). */
export function readVideoDuration(file: Blob, timeoutMs = 4000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const finish = (seconds: number | null) => {
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(seconds !== null && Number.isFinite(seconds) ? seconds : null);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => finish(video.duration);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/** Why a video can't be posted, or null if it can (or its length can't be told here). */
export async function videoLengthError(file: Blob): Promise<string | null> {
  const seconds = await readVideoDuration(file);
  return seconds !== null && seconds > MAX_VIDEO_SECONDS + 0.5 ? `Videos can be at most ${MAX_VIDEO_SECONDS} seconds.` : null;
}

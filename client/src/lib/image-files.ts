/**
 * Formats the server accepts. Listing them (rather than `image/*`) also makes iOS
 * convert HEIC photos to JPEG when one is picked from the photo library.
 */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

/** Mirrors the server's upload limit, so oversized files fail fast instead of after uploading. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** A quick client-side check for instant feedback. The server validates every upload regardless. */
export function imageFileError(file: File): string | null {
  if (file.type === "image/heic" || file.type === "image/heif") {
    return "HEIC photos aren't supported. Choose a JPEG, or set your camera to “Most Compatible”.";
  }
  if (!IMAGE_ACCEPT.split(",").includes(file.type)) {
    return "That file isn't a supported image. Use a JPEG, PNG, WebP or AVIF photo.";
  }
  if (file.size > MAX_IMAGE_BYTES) return "Photos can be at most 20 MB.";
  return null;
}

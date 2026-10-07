/** The server keeps photos at most this big (its full-size rendition), so there's no point sending more. */
const MAX_EDGE_PX = 2560;
/** Files this small upload quickly enough as they are. */
const SMALL_BYTES = 2 * 1024 * 1024;
/** Only formats without transparency are re-encoded (as JPEG). */
const SHRINKABLE = new Set(["image/jpeg", "image/webp"]);

/**
 * Scales a big photo down to 2560px on its long edge (the size the server keeps) before
 * it's uploaded: a 12-megapixel phone photo goes from ~5 MB to well under 1 MB, which
 * matters on mobile data. Anything that can't be decoded, or wouldn't get smaller, is
 * sent as it is; the server checks and processes every upload either way.
 */
export async function shrinkForUpload(image: Blob): Promise<Blob> {
  if (!SHRINKABLE.has(image.type) || typeof createImageBitmap !== "function") return image;

  let bitmap: ImageBitmap;
  try {
    // Applies the EXIF orientation, so the result is upright without it.
    bitmap = await createImageBitmap(image, { imageOrientation: "from-image" });
  } catch {
    return image;
  }

  try {
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && image.size <= SMALL_BYTES) return image;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return image;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const shrunk = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return shrunk && shrunk.size < image.size ? shrunk : image;
  } finally {
    bitmap.close();
  }
}

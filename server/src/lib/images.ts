import sharp, { type Metadata, type ResizeOptions } from "sharp";
import { AppError } from "./errors.js";

/** ~64 megapixels. Larger images are rejected before decoding (memory and decompression-bomb guard). */
export const MAX_IMAGE_PIXELS = 64_000_000;

export const IMAGE_CONTENT_TYPE = "image/webp";

export type ProcessedImage = { data: Buffer; width: number; height: number };

type VariantSpec = { resize: ResizeOptions; quality: number };

/**
 * Every photo is stored as three WebP renditions. `full` replaces the original upload,
 * which is never kept: re-encoding strips EXIF metadata such as GPS location.
 */
export const PHOTO_VARIANTS = {
  full: { resize: { width: 2560, height: 2560, fit: "inside" }, quality: 82 },
  medium: { resize: { width: 1280, height: 1280, fit: "inside" }, quality: 78 },
  /** Square, centre-cropped: for grids. */
  thumbnail: { resize: { width: 480, height: 480, fit: "cover" }, quality: 72 },
} as const satisfies Record<string, VariantSpec>;

export type PhotoVariant = keyof typeof PHOTO_VARIANTS;

const AVATAR_VARIANT: VariantSpec = { resize: { width: 256, height: 256, fit: "cover" }, quality: 80 };

const unsupportedImage = () =>
  new AppError(415, "UNSUPPORTED_IMAGE", "That file isn't a supported image. Use a JPEG, PNG, WebP or AVIF photo.");

/**
 * Validates by content, never by file name or the browser-supplied MIME type: sharp
 * sniffs the real format from the bytes.
 */
async function assertSupportedImage(input: Buffer): Promise<void> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch {
    throw unsupportedImage();
  }

  const { format, compression, width = 0, height = 0 } = metadata;
  if (format === "heif" && compression !== "av1") {
    // HEIC (HEVC-encoded) photos can't be decoded by the bundled libvips.
    throw new AppError(
      415,
      "UNSUPPORTED_IMAGE",
      "HEIC photos aren't supported. Choose a JPEG, or set your camera to “Most Compatible”.",
    );
  }
  if (!["jpeg", "png", "webp", "heif"].includes(format)) throw unsupportedImage();
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new AppError(413, "IMAGE_TOO_LARGE", "That photo's resolution is too high (64 megapixels max).");
  }
}

async function render(input: Buffer, { resize, quality }: VariantSpec): Promise<ProcessedImage> {
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error" })
      .rotate() // apply the EXIF orientation before the metadata is dropped
      .resize({ ...resize, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    // The header looked fine but the image data is corrupt or truncated.
    throw unsupportedImage();
  }
}

export async function processPhoto(input: Buffer): Promise<Record<PhotoVariant, ProcessedImage>> {
  await assertSupportedImage(input);
  const [full, medium, thumbnail] = await Promise.all([
    render(input, PHOTO_VARIANTS.full),
    render(input, PHOTO_VARIANTS.medium),
    render(input, PHOTO_VARIANTS.thumbnail),
  ]);
  return { full, medium, thumbnail };
}

export async function processAvatar(input: Buffer): Promise<ProcessedImage> {
  await assertSupportedImage(input);
  return render(input, AVATAR_VARIANT);
}

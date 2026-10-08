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
type Size = { width: number; height: number };

/** Returns the image's size once upright (its EXIF orientation applied). */
async function assertSupportedImage(input: Buffer): Promise<Size> {
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
  return metadata.autoOrient;
}

/**
 * Square ("cover") renditions are never bigger than the image's short side: images are
 * never enlarged, and on its own that would keep a small image's shape instead of making
 * it square (a 1000×300 photo would get a 480×300 "square" thumbnail).
 */
function resizeFor({ resize }: VariantSpec, upright: Size): ResizeOptions {
  if (resize.fit !== "cover") return resize;
  const side = Math.min(resize.width ?? Infinity, upright.width, upright.height);
  return { ...resize, width: side, height: side };
}

async function render(input: Buffer, variant: VariantSpec, upright: Size): Promise<ProcessedImage> {
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error" })
      .rotate() // apply the EXIF orientation before the metadata is dropped
      .resize({ ...resizeFor(variant, upright), withoutEnlargement: true })
      .webp({ quality: variant.quality })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    // The header looked fine but the image data is corrupt or truncated.
    throw unsupportedImage();
  }
}

export async function processPhoto(input: Buffer): Promise<Record<PhotoVariant, ProcessedImage>> {
  const upright = await assertSupportedImage(input);
  const [full, medium, thumbnail] = await Promise.all([
    render(input, PHOTO_VARIANTS.full, upright),
    render(input, PHOTO_VARIANTS.medium, upright),
    render(input, PHOTO_VARIANTS.thumbnail, upright),
  ]);
  return { full, medium, thumbnail };
}

export async function processAvatar(input: Buffer): Promise<ProcessedImage> {
  const upright = await assertSupportedImage(input);
  return render(input, AVATAR_VARIANT, upright);
}

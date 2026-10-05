import { z } from "zod";
import { PHOTO_VARIANTS, type PhotoVariant } from "../../lib/images.js";

export const CAPTION_MAX_LENGTH = 500;

/** Optional. Line breaks are kept; other control characters are rejected. Blank means no caption. */
export const captionSchema = z
  .string()
  .transform((value) => value.replace(/\r\n?/g, "\n").trim())
  .pipe(
    z
      .string()
      .max(CAPTION_MAX_LENGTH, `Captions can be at most ${CAPTION_MAX_LENGTH} characters`)
      .regex(/^(?:[^\p{Cc}]|\n)*$/u, "Caption contains invalid characters"),
  )
  .transform((value) => value || null);

/** The multipart text fields sent alongside the photo file. */
export const createPhotoSchema = z.object({
  caption: captionSchema.optional(),
});

export const photoParamsSchema = z.object({ photoId: z.uuid() });

const variants = Object.keys(PHOTO_VARIANTS) as [PhotoVariant, ...PhotoVariant[]];

export const photoImageParamsSchema = z.object({
  photoId: z.uuid(),
  variant: z.enum(variants),
});

export type PhotoCursor = { createdAt: Date; id: string };

/** Keyset cursor: "<createdAt ms>_<id>" of the last photo on the previous page. */
export function encodePhotoCursor({ createdAt, id }: PhotoCursor): string {
  return `${createdAt.getTime()}_${id}`;
}

const cursorSchema = z
  .string()
  .regex(/^\d{1,15}_[0-9a-f-]{36}$/, "Invalid cursor")
  .transform((value): PhotoCursor => {
    const [ms, id] = value.split("_") as [string, string];
    return { createdAt: new Date(Number(ms)), id };
  });

export const listPhotosQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export type ListPhotosQuery = z.infer<typeof listPhotosQuerySchema>;

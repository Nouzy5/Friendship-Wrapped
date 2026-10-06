import { z } from "zod";
import { PHOTO_VARIANTS, type PhotoVariant } from "../../lib/images.js";
import { pageQuerySchema } from "../../lib/pagination.js";
import { multilineTextSchema } from "../../lib/user-text.js";

export const CAPTION_MAX_LENGTH = 500;

/** Optional. Blank means no caption. */
export const captionSchema = multilineTextSchema(CAPTION_MAX_LENGTH, "Caption").transform((value) => value || null);

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

export const listPhotosQuerySchema = pageQuerySchema(24);

export type ListPhotosQuery = z.infer<typeof listPhotosQuerySchema>;

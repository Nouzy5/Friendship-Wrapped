import { z } from "zod";
import { idSchema } from "../../lib/ids.js";
import { pageQuerySchema } from "../../lib/pagination.js";
import { hasVisibleCharacter, SINGLE_LINE_NAME_PATTERN } from "../../lib/user-text.js";

export const ALBUM_NAME_MAX_LENGTH = 60;

export const albumInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the album a name")
    .max(ALBUM_NAME_MAX_LENGTH, `Album names can be at most ${ALBUM_NAME_MAX_LENGTH} characters`)
    .regex(SINGLE_LINE_NAME_PATTERN, "Album name contains invalid characters")
    .refine(hasVisibleCharacter, "Give the album a name"),
});

export const albumParamsSchema = z.object({ albumId: idSchema });

export const albumPhotoParamsSchema = z.object({ albumId: idSchema, photoId: idSchema });

/** Adding several at once, from the album's photo picker. Duplicates are ignored. */
export const addAlbumPhotosSchema = z.object({
  photoIds: z
    .array(idSchema)
    .min(1, "Choose at least one photo")
    .max(100, "Add at most 100 photos at a time")
    .transform((ids) => [...new Set(ids)]),
});

export const listAlbumPhotosQuerySchema = pageQuerySchema(48);

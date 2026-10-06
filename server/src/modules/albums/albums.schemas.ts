import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

export const ALBUM_NAME_MAX_LENGTH = 60;

export const albumInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the album a name")
    .max(ALBUM_NAME_MAX_LENGTH, `Album names can be at most ${ALBUM_NAME_MAX_LENGTH} characters`)
    .regex(/^[^\p{Cc}]+$/u, "Album name contains invalid characters"),
});

export const albumParamsSchema = z.object({ albumId: z.uuid() });

export const albumPhotoParamsSchema = z.object({ albumId: z.uuid(), photoId: z.uuid() });

/** Adding several at once, from the album's photo picker. Duplicates are ignored. */
export const addAlbumPhotosSchema = z.object({
  photoIds: z
    .array(z.uuid())
    .min(1, "Choose at least one photo")
    .max(100, "Add at most 100 photos at a time")
    .transform((ids) => [...new Set(ids)]),
});

export const listAlbumPhotosQuerySchema = pageQuerySchema(48);

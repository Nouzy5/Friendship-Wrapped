import { z } from "zod";
import { idSchema } from "../../lib/ids.js";
import { PHOTO_VARIANTS, type PhotoVariant } from "../../lib/images.js";
import { pageQuerySchema } from "../../lib/pagination.js";
import { isRealDate, isValidTimeZone, type CalendarDate } from "../../lib/time-zone.js";
import { multilineTextSchema } from "../../lib/user-text.js";

export const CAPTION_MAX_LENGTH = 500;

/** Optional. Blank means no caption. */
export const captionSchema = multilineTextSchema(CAPTION_MAX_LENGTH, "Caption").transform((value) => value || null);

/** The multipart text fields sent alongside the photo file. */
export const createPhotoSchema = z.object({
  caption: captionSchema.optional(),
});

export const photoParamsSchema = z.object({ photoId: idSchema });

const variants = Object.keys(PHOTO_VARIANTS) as [PhotoVariant, ...PhotoVariant[]];

export const photoImageParamsSchema = z.object({
  photoId: idSchema,
  variant: z.enum(variants),
});

export const listPhotosQuerySchema = pageQuerySchema(24).extend({
  /** Start from photos posted before this instant, e.g. the end of a month the timeline jumps to. */
  before: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
  /** Only the photos you've favorited. */
  favorites: z.stringbool().optional(),
  /** Only the photos this person posted ("Taken by"). */
  uploaderId: idSchema.optional(),
});

/** `?download=1` serves the image as a file to save, for those allowed to. */
export const photoImageQuerySchema = z.object({ download: z.stringbool().optional() });

const calendarDateSchema = z.iso
  .date()
  .transform((value): CalendarDate => {
    const [year, month, day] = value.split("-").map(Number) as [number, number, number];
    return { year, month, day };
  })
  .refine(isRealDate, "Invalid date");

export const onThisDayQuerySchema = z.object({
  /** The viewer's IANA time zone, e.g. "Europe/Bratislava": days begin at their midnight. */
  tz: z.string().refine(isValidTimeZone, "Unknown time zone"),
  /** Defaults to today in `tz`. */
  date: calendarDateSchema.optional(),
});

export type OnThisDayQuery = z.infer<typeof onThisDayQuerySchema>;

export type ListPhotosQuery = z.infer<typeof listPhotosQuerySchema>;

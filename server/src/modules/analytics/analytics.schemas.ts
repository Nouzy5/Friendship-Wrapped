import { z } from "zod";
import { idSchema } from "../../lib/ids.js";
import { canonicalTimeZone, isValidTimeZone } from "../../lib/time-zone.js";

export const yearStatsParamsSchema = z.object({
  groupId: idSchema,
  year: z.coerce.number().int().min(2000, "Invalid year").max(2100, "Invalid year"),
});

/** The viewer's IANA time zone, by its canonical name: the year, its months and days begin at their midnight. */
export const timeZoneSchema = z.string().refine(isValidTimeZone, "Unknown time zone").transform(canonicalTimeZone);

export const yearStatsQuerySchema = z.object({ tz: timeZoneSchema });

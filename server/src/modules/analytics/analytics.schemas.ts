import { z } from "zod";
import { isValidTimeZone } from "../../lib/time-zone.js";

export const yearStatsParamsSchema = z.object({
  groupId: z.uuid(),
  year: z.coerce.number().int().min(2000, "Invalid year").max(2100, "Invalid year"),
});

export const yearStatsQuerySchema = z.object({
  /** The viewer's IANA time zone: the year, its months and days begin at their midnight. */
  tz: z.string().refine(isValidTimeZone, "Unknown time zone"),
});

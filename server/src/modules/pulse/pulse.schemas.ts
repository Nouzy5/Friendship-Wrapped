import { z } from "zod";
import { timeZoneSchema } from "../analytics/analytics.schemas.js";

/** The viewer's IANA time zone: the month and the weeks begin at their midnight. */
export const pulseQuerySchema = z.object({ tz: timeZoneSchema });

import { z } from "zod";
import { timeZoneSchema } from "../analytics/analytics.schemas.js";

/** "HH:MM", 24-hour. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time such as 23:00");

/** Any subset of UserSettings, nested objects included. */
export const updateSettingsSchema = z.object({
  allowPhotoSaving: z.boolean().optional(),
  showInWrapped: z.boolean().optional(),
  timeZone: timeZoneSchema.nullable().optional(),
  notifications: z
    .object({
      enabled: z.boolean(),
      photos: z.boolean(),
      reactions: z.boolean(),
      comments: z.boolean(),
      members: z.boolean(),
      onThisDay: z.boolean(),
      wrapped: z.boolean(),
      nudges: z.boolean(),
      moments: z.boolean(),
      quietHours: z.object({ enabled: z.boolean(), start: timeOfDaySchema, end: timeOfDaySchema }).partial(),
    })
    .partial()
    .optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

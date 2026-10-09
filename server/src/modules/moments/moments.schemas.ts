import { z } from "zod";
import { idSchema } from "../../lib/ids.js";
import { pageQuerySchema } from "../../lib/pagination.js";
import { hasVisibleCharacter, SINGLE_LINE_NAME_PATTERN } from "../../lib/user-text.js";
import { groupEmojiSchema } from "../groups/groups.schemas.js";

export const MOMENT_TITLE_MAX_LENGTH = 60;

/** How long a moment stays open, in hours. */
export const MOMENT_DURATIONS_HOURS = [1, 3, 12, 24] as const;
export const DEFAULT_MOMENT_HOURS = 3;

export const createMomentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the moment a name")
    .max(MOMENT_TITLE_MAX_LENGTH, `Moment names can be at most ${MOMENT_TITLE_MAX_LENGTH} characters`)
    .regex(SINGLE_LINE_NAME_PATTERN, "Moment name contains invalid characters")
    .refine(hasVisibleCharacter, "Give the moment a name"),
  /** One emoji to go with it; leave it out for none. */
  emoji: groupEmojiSchema.nullish(),
  durationHours: z
    .union(
      MOMENT_DURATIONS_HOURS.map((hours) => z.literal(hours)),
      { error: "Choose 1, 3, 12 or 24 hours" },
    )
    .default(DEFAULT_MOMENT_HOURS),
});

export type CreateMomentInput = z.infer<typeof createMomentSchema>;

export const momentParamsSchema = z.object({ momentId: idSchema });

export const listMomentsQuerySchema = pageQuerySchema(24);
export const listMomentPhotosQuerySchema = pageQuerySchema(48);

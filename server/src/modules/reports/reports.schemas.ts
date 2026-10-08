import { z } from "zod";
import { idSchema } from "../../lib/ids.js";
import { multilineTextSchema } from "../../lib/user-text.js";

export const REPORT_MAX_LENGTH = 1000;

/** About a photo, a person, both, or neither (general feedback). */
export const createReportSchema = z.object({
  photoId: idSchema.optional(),
  userId: idSchema.optional(),
  message: multilineTextSchema(REPORT_MAX_LENGTH, "Report").refine((text) => text.length > 0, "Say what's wrong"),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

import { z } from "zod";
import { ReactionType } from "../../generated/prisma/client.js";

export const setReactionSchema = z.object({
  type: z.enum(ReactionType, { error: "Choose one of the reactions" }),
});

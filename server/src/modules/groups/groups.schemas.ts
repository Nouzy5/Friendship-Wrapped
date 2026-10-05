import { z } from "zod";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

/** Exactly one user-perceived character that is an emoji (flags and ZWJ sequences included). */
function isSingleEmoji(value: string): boolean {
  return (
    [...graphemes.segment(value)].length === 1 &&
    EMOJI_PATTERN.test(value) &&
    [...value].length <= 16 // the column's code-point limit
  );
}

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Give your group a name")
  .max(50, "Group name must be at most 50 characters")
  .regex(/^[^\p{Cc}]+$/u, "Group name contains invalid characters");

export const groupEmojiSchema = z.string().trim().refine(isSingleEmoji, { message: "Pick a single emoji" });

export const createGroupSchema = z.object({
  name: groupNameSchema,
  emoji: groupEmojiSchema,
});

export const updateGroupSchema = z
  .object({
    name: groupNameSchema.optional(),
    emoji: groupEmojiSchema.optional(),
  })
  .refine((input) => input.name !== undefined || input.emoji !== undefined, {
    message: "Nothing to update",
  });

export const groupParamsSchema = z.object({ groupId: z.uuid() });
export const memberParamsSchema = z.object({ groupId: z.uuid(), userId: z.uuid() });

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

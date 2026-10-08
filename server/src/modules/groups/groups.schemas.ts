import { z } from "zod";
import { idSchema } from "../../lib/ids.js";
import { hasVisibleCharacter, SINGLE_LINE_NAME_PATTERN } from "../../lib/user-text.js";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|^[0-9#*]\uFE0F?\u20E3$/u;

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
  .regex(SINGLE_LINE_NAME_PATTERN, "Group name contains invalid characters")
  .refine(hasVisibleCharacter, "Give your group a name");

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

export const groupParamsSchema = z.object({ groupId: idSchema });
export const memberParamsSchema = z.object({ groupId: idSchema, userId: idSchema });

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

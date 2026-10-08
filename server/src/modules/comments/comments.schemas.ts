import { z } from "zod";
import { idSchema } from "../../lib/ids.js";
import { pageQuerySchema } from "../../lib/pagination.js";
import { multilineTextSchema } from "../../lib/user-text.js";

export const COMMENT_MAX_LENGTH = 500;

export const createCommentSchema = z.object({
  body: multilineTextSchema(COMMENT_MAX_LENGTH, "Comment").refine((body) => body.length > 0, "Write a comment first"),
});

export const commentParamsSchema = z.object({ commentId: idSchema });

export const listCommentsQuerySchema = pageQuerySchema(30);

export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;

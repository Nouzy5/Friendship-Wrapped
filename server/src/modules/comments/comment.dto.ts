import type { Prisma } from "../../generated/prisma/client.js";
import { toUserSummary, userSummarySelect, type UserSummary } from "../users/user.dto.js";

export const commentSelect = {
  id: true,
  photoId: true,
  body: true,
  createdAt: true,
  author: { select: userSummarySelect },
} satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

export type CommentView = {
  id: string;
  photoId: string;
  body: string;
  createdAt: Date;
  author: UserSummary;
  /** Only the author may delete a comment. */
  canDelete: boolean;
};

export function toCommentView(comment: CommentRow, viewerId: string): CommentView {
  return {
    id: comment.id,
    photoId: comment.photoId,
    body: comment.body,
    createdAt: comment.createdAt,
    author: toUserSummary(comment.author),
    canDelete: comment.author.id === viewerId,
  };
}

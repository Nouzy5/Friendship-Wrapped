import { forbidden, notFound } from "../../lib/errors.js";
import { toPage } from "../../lib/pagination.js";
import { canSeePhoto, requireMemberAccess, requireVisiblePhoto } from "../photos/photos.service.js";
import { toCommentView, type CommentView } from "./comment.dto.js";
import * as commentsRepository from "./comments.repository.js";
import type { ListCommentsQuery } from "./comments.schemas.js";

/** Only current members of the photo's group can comment. */
export async function addComment(photoId: string, authorId: string, body: string): Promise<CommentView> {
  await requireMemberAccess(photoId, authorId);
  const comment = await commentsRepository.createComment({ photoId, authorId, body });
  return toCommentView(comment, authorId);
}

export async function listComments(
  photoId: string,
  viewerId: string,
  { cursor, limit }: ListCommentsQuery,
): Promise<{ comments: CommentView[]; nextCursor: string | null }> {
  await requireVisiblePhoto(photoId, viewerId);
  const rows = await commentsRepository.listComments(photoId, { cursor, take: limit + 1 });
  const { items, nextCursor } = toPage(rows, limit);
  return { comments: items.map((comment) => toCommentView(comment, viewerId)), nextCursor };
}

/**
 * Authors can always delete their own comments, even after leaving the group. Anyone
 * else gets 403 if they can see the photo, and 404 if they can't.
 */
export async function deleteComment(commentId: string, userId: string): Promise<void> {
  const comment = await commentsRepository.findComment(commentId);
  if (!comment) throw notFound("Comment not found");

  if (comment.authorId !== userId) {
    if (!(await canSeePhoto(comment.photoId, userId))) throw notFound("Comment not found");
    throw forbidden("You can only delete your own comments");
  }
  await commentsRepository.deleteComment(commentId);
}

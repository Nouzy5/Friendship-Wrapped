import { apiRequest } from "../../lib/api-client";
import type { Comment, CommentPage } from "./types";

const photoCommentsPath = (photoId: string) => `/photos/${encodeURIComponent(photoId)}/comments`;

/** One page of a photo's comments, oldest first. Pass the previous page's `nextCursor` to continue. */
export function fetchComments(photoId: string, cursor: string | null, signal?: AbortSignal): Promise<CommentPage> {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  return apiRequest<CommentPage>(`${photoCommentsPath(photoId)}${query}`, { signal });
}

export async function addComment(photoId: string, body: string): Promise<Comment> {
  const { comment } = await apiRequest<{ comment: Comment }>(photoCommentsPath(photoId), {
    method: "POST",
    body: { body },
  });
  return comment;
}

export async function deleteComment(commentId: string): Promise<void> {
  await apiRequest<null>(`/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
}

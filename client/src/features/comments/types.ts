import type { UserSummary } from "../auth/types";

export type Comment = {
  id: string;
  photoId: string;
  body: string;
  createdAt: string;
  author: UserSummary;
  /** Only the author may delete a comment. */
  canDelete: boolean;
};

export type CommentPage = { comments: Comment[]; nextCursor: string | null };

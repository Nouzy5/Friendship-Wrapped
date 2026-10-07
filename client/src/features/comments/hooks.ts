import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { patchCachedPhoto } from "../photos/cache";
import type { Photo } from "../photos/types";
import { addComment, deleteComment, fetchComments } from "./api";
import type { Comment, CommentPage } from "./types";

export const commentKeys = {
  list: (photoId: string) => ["comments", photoId] as const,
};

type CommentData = InfiniteData<CommentPage, string | null>;

/**
 * Every comment loaded so far. A comment you just posted is shown straight away even if
 * older pages haven't loaded yet; when its real page arrives, that copy (in its proper
 * place) wins.
 */
function allComments(data: CommentData): Comment[] {
  const byId = new Map<string, Comment>();
  for (const comment of data.pages.flatMap((page) => page.comments)) {
    byId.delete(comment.id);
    byId.set(comment.id, comment);
  }
  return [...byId.values()];
}

/** A photo's comments, oldest first, a page at a time: `data` is every comment loaded so far. */
export function useComments(photoId: string) {
  return useInfiniteQuery({
    queryKey: commentKeys.list(photoId),
    queryFn: ({ pageParam, signal }) => fetchComments(photoId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: allComments,
  });
}

export function useAddComment(photo: Pick<Photo, "id" | "groupId">) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addComment(photo.id, body),
    onSuccess: (comment) => {
      // Shown at the end straight away (see allComments for when later pages load).
      queryClient.setQueryData<CommentData>(commentKeys.list(photo.id), (data) => {
        const last = data?.pages.at(-1);
        if (!data || !last) return data;
        return { ...data, pages: [...data.pages.slice(0, -1), { ...last, comments: [...last.comments, comment] }] };
      });
      patchCachedPhoto(queryClient, photo, (current) => ({ commentCount: current.commentCount + 1 }));
    },
  });
}

export function useDeleteComment(photo: Pick<Photo, "id" | "groupId">) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteComment,
    onSuccess: (_, commentId) => {
      queryClient.setQueryData<CommentData>(
        commentKeys.list(photo.id),
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              comments: page.comments.filter(({ id }) => id !== commentId),
            })),
          },
      );
      patchCachedPhoto(queryClient, photo, (current) => ({ commentCount: Math.max(0, current.commentCount - 1) }));
    },
  });
}

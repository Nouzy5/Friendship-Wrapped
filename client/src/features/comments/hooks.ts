import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { patchCachedPhoto } from "../photos/cache";
import type { Photo } from "../photos/types";
import { addComment, deleteComment, fetchComments } from "./api";
import type { Comment, CommentPage } from "./types";

export const commentKeys = {
  list: (photoId: string) => ["comments", photoId] as const,
};

type CommentData = InfiniteData<CommentPage, string | null>;

const allComments = (data: CommentData): Comment[] => data.pages.flatMap((page) => page.comments);

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
      // Shown at the end straight away, unless later pages are still to load (it comes with them).
      queryClient.setQueryData<CommentData>(commentKeys.list(photo.id), (data) => {
        const last = data?.pages.at(-1);
        if (!data || !last || last.nextCursor) return data;
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

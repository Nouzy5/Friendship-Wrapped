import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelPhotoQueries, patchCachedPhoto, photoKeys } from "../photos/cache";
import type { Photo } from "../photos/types";
import { fetchReactions, removeReaction, setReaction } from "./api";
import { withReaction } from "./reactions";
import type { ReactionType } from "./types";

export const reactionKeys = {
  list: (photoId: string) => ["reactions", photoId] as const,
};

/** Who reacted to a photo, and how (loaded when asked for). */
export function useReactionList(photoId: string, enabled: boolean) {
  return useQuery({
    queryKey: reactionKeys.list(photoId),
    queryFn: ({ signal }) => fetchReactions(photoId, signal),
    enabled,
  });
}

/**
 * Sets your reaction to a photo (null removes it). The change shows straight away
 * everywhere the photo appears. Taps on one photo are sent in order, and only the
 * last one's answer is applied, so quick changes of mind don't flicker.
 */
export function useReact(photo: Pick<Photo, "id" | "groupId">) {
  const queryClient = useQueryClient();
  const mutationKey = ["react", photo.id];
  const isLatest = () => queryClient.isMutating({ mutationKey }) === 1;

  return useMutation({
    mutationKey,
    scope: { id: `react:${photo.id}` },
    meta: { errorToast: "Couldn't save your reaction." },
    mutationFn: (type: ReactionType | null) => (type ? setReaction(photo.id, type) : removeReaction(photo.id)),
    onMutate: async (type) => {
      // A refetch already on its way read the old reaction: it mustn't land on top of this tap.
      await cancelPhotoQueries(queryClient, photo);
      patchCachedPhoto(queryClient, photo, (current) => ({ reactions: withReaction(current.reactions, type) }));
    },
    onSuccess: (summary) => {
      if (isLatest()) patchCachedPhoto(queryClient, photo, () => ({ reactions: summary }));
      void queryClient.invalidateQueries({ queryKey: reactionKeys.list(photo.id) });
    },
    onError: () => {
      // Put back what the server has.
      if (!isLatest()) return;
      void queryClient.invalidateQueries({ queryKey: photoKeys.detail(photo.id) });
      void queryClient.invalidateQueries({ queryKey: photoKeys.group(photo.groupId) });
    },
  });
}

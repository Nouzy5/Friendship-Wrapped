import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cancelPhotoQueries, patchCachedPhoto, photoKeys } from "../photos/cache";
import type { Photo } from "../photos/types";
import { setFavorite } from "./api";

/** Favorites or unfavorites a photo, showing the change straight away (like `useReact`). */
export function useFavorite(photo: Pick<Photo, "id" | "groupId">) {
  const queryClient = useQueryClient();
  const mutationKey = ["favorite", photo.id];
  const isLatest = () => queryClient.isMutating({ mutationKey }) === 1;

  return useMutation({
    mutationKey,
    scope: { id: `favorite:${photo.id}` },
    meta: { errorToast: "Couldn't update your favorites." },
    mutationFn: (favorite: boolean) => setFavorite(photo.id, favorite),
    onMutate: async (favorite) => {
      await cancelPhotoQueries(queryClient, photo);
      patchCachedPhoto(queryClient, photo, () => ({ isFavorite: favorite }));
    },
    onSuccess: (isFavorite) => {
      if (isLatest()) patchCachedPhoto(queryClient, photo, () => ({ isFavorite }));
      void queryClient.invalidateQueries({ queryKey: photoKeys.favorites(photo.groupId) });
    },
    onError: () => {
      if (!isLatest()) return;
      void queryClient.invalidateQueries({ queryKey: photoKeys.detail(photo.id) });
      void queryClient.invalidateQueries({ queryKey: photoKeys.group(photo.groupId) });
    },
  });
}

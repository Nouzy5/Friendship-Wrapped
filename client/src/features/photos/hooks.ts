import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { deletePhoto, fetchGroupPhotos, fetchPhoto, uploadPhoto, type GroupPhotosFilter } from "./api";
import { findCachedPhotoDetail, photoKeys, updateCachedFeed, type FeedData } from "./cache";
import { wrappedKeys } from "../wrapped/hooks";
import type { Photo } from "./types";

/** Photos per feed page: eight rows of the three-column grid. */
const FEED_PAGE_SIZE = 24;

const allPhotos = (feed: FeedData): Photo[] => feed.pages.flatMap((page) => page.photos);

function groupPhotosKey(groupId: string, { before, favorites, uploaderId }: GroupPhotosFilter) {
  if (favorites) return photoKeys.favorites(groupId);
  if (uploaderId) return before ? [...photoKeys.byUploader(groupId, uploaderId), "before", before] : photoKeys.byUploader(groupId, uploaderId);
  if (before) return photoKeys.groupFrom(groupId, before);
  return photoKeys.group(groupId);
}

/**
 * A group's photos, newest first, one page at a time: `data` is every photo loaded so
 * far. Without a filter this is the feed, and the timeline shares its cache.
 */
export function useGroupFeed(groupId: string, filter: GroupPhotosFilter = {}) {
  return useInfiniteQuery({
    queryKey: groupPhotosKey(groupId, filter),
    queryFn: ({ pageParam, signal }) =>
      fetchGroupPhotos(groupId, { cursor: pageParam, limit: FEED_PAGE_SIZE, ...filter }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: allPhotos,
  });
}

export function usePhoto(photoId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: photoKeys.detail(photoId),
    queryFn: ({ signal }) => fetchPhoto(photoId, signal),
    placeholderData: () => findCachedPhotoDetail(queryClient, photoId),
  });
}

/** Loads a photo's details and image in the background, so opening it next is instant. */
export function usePrefetchPhoto(photoId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!photoId) return;
    queryClient
      .fetchQuery({ queryKey: photoKeys.detail(photoId), queryFn: ({ signal }) => fetchPhoto(photoId, signal) })
      .then((photo) => {
        new Image().src = photo.imageUrls.medium;
      })
      // Only a head start: if it fails, the viewer loads it (and shows any error) when it's opened.
      .catch(() => undefined);
  }, [queryClient, photoId]);
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadPhoto,
    onSuccess: (photo) => {
      updateCachedFeed(queryClient, photo.groupId, ([first, ...rest]) =>
        first ? [{ ...first, photos: [photo, ...first.photos] }, ...rest] : [],
      );
      void queryClient.invalidateQueries({ queryKey: photoKeys.group(photo.groupId) });
      // The previous newest photo now has a newer neighbour.
      void queryClient.invalidateQueries({ queryKey: photoKeys.details() });
      // It may start this year's Wrapped, and it counts in it.
      void queryClient.invalidateQueries({ queryKey: wrappedKeys.all });
    },
  });
}

export function useDeletePhoto(photo: Pick<Photo, "id" | "groupId">) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deletePhoto(photo.id),
    onSuccess: () => {
      // Not just this photo: its neighbours link to it, and stale links would be followed
      // (and prefetched) until they refresh. Details are cheap to reload.
      queryClient.removeQueries({ queryKey: photoKeys.details() });
      updateCachedFeed(queryClient, photo.groupId, (pages) =>
        pages.map((page) => ({ ...page, photos: page.photos.filter(({ id }) => id !== photo.id) })),
      );
      void queryClient.invalidateQueries({ queryKey: photoKeys.group(photo.groupId) });
      // Album counts and covers may have included it, and so may Wrapped.
      void queryClient.invalidateQueries({ queryKey: ["albums"] });
      void queryClient.invalidateQueries({ queryKey: wrappedKeys.all });
    },
  });
}

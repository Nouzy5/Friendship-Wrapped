import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Photo, PhotoDetail, PhotoPage } from "./types";

export const photoKeys = {
  all: ["photos"] as const,
  /** The group's feed. Filtered lists (timeline jumps, favorites) sit underneath it, so invalidating it covers them. */
  group: (groupId: string) => [...photoKeys.all, "group", groupId] as const,
  groupFrom: (groupId: string, before: string) => [...photoKeys.group(groupId), "before", before] as const,
  favorites: (groupId: string) => [...photoKeys.group(groupId), "favorites"] as const,
  details: () => [...photoKeys.all, "detail"] as const,
  detail: (photoId: string) => [...photoKeys.details(), photoId] as const,
};

export type FeedData = InfiniteData<PhotoPage, string | null>;

/** Edits the cached feed in place (if it's cached), so a change shows before any refetch lands. */
export function updateCachedFeed(
  queryClient: QueryClient,
  groupId: string,
  update: (pages: PhotoPage[]) => PhotoPage[],
) {
  queryClient.setQueryData<FeedData>(photoKeys.group(groupId), (feed) => feed && { ...feed, pages: update(feed.pages) });
}

/**
 * Applies a change to one photo wherever it's cached (its group feed and its viewer),
 * e.g. a new reaction or comment count, without refetching either.
 */
export function patchCachedPhoto(
  queryClient: QueryClient,
  photo: Pick<Photo, "id" | "groupId">,
  patch: (current: Photo) => Partial<Photo>,
) {
  queryClient.setQueryData<PhotoDetail>(photoKeys.detail(photo.id), (detail) => detail && { ...detail, ...patch(detail) });
  updateCachedFeed(queryClient, photo.groupId, (pages) =>
    pages.map((page) => ({
      ...page,
      photos: page.photos.map((cached) => (cached.id === photo.id ? { ...cached, ...patch(cached) } : cached)),
    })),
  );
}

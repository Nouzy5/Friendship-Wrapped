import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { albumKeys } from "../albums/hooks";
import { groupKeys } from "../groups/hooks";
import { onThisDayKeys } from "../memories/hooks";
import type { OnThisDay } from "../memories/api";
import type { Group } from "../groups/types";
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
 * Stops refetches of a photo's viewer and group lists that are under way, before a change
 * to it is shown: they'd bring back what the server had before the change.
 */
export async function cancelPhotoQueries(queryClient: QueryClient, photo: Pick<Photo, "id" | "groupId">) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: photoKeys.detail(photo.id) }),
    queryClient.cancelQueries({ queryKey: photoKeys.group(photo.groupId) }),
  ]);
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

/**
 * Takes a deleted photo out of every cached list it may be in (its group's feed, timeline
 * and favorites, albums, On This Day), so it's gone before any refetch lands rather than
 * lingering as a broken thumbnail.
 */
export function removeCachedPhoto(queryClient: QueryClient, photo: Pick<Photo, "id" | "groupId">) {
  const without = (photos: Photo[]) => photos.filter(({ id }) => id !== photo.id);
  const fromPages = (data: FeedData | undefined) =>
    data && { ...data, pages: data.pages.map((page) => ({ ...page, photos: without(page.photos) })) };

  queryClient.setQueriesData<FeedData>({ queryKey: photoKeys.group(photo.groupId) }, fromPages);
  queryClient.setQueriesData<FeedData>({ queryKey: [...albumKeys.all, "photos"] }, fromPages);
  queryClient.setQueriesData<OnThisDay>(
    { queryKey: onThisDayKeys.group(photo.groupId) },
    (data) =>
      data && {
        ...data,
        years: data.years
          .map((year) => ({ ...year, photos: without(year.photos) }))
          .filter((year) => year.photos.length > 0),
      },
  );
}

/**
 * A photo from any cached list it's in (feed, timeline, favorites), dressed up as the viewer's
 * details with its group from the cached group list: so opening it from a grid shows it at
 * once, and the details (neighbours for swiping) fill in when they arrive.
 */
export function findCachedPhotoDetail(queryClient: QueryClient, photoId: string): PhotoDetail | undefined {
  for (const [, feed] of queryClient.getQueriesData<FeedData>({ queryKey: [...photoKeys.all, "group"] })) {
    const photo = feed?.pages.flatMap((page) => page.photos).find(({ id }) => id === photoId);
    if (!photo) continue;
    const group = queryClient.getQueryData<Group[]>(groupKeys.list())?.find(({ id }) => id === photo.groupId);
    if (!group) return undefined;
    return { ...photo, group: { id: group.id, name: group.name, emoji: group.emoji }, feed: { newerId: null, olderId: null } };
  }
  return undefined;
}

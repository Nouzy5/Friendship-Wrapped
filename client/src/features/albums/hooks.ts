import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import type { Photo, PhotoPage } from "../photos/types";
import {
  addAlbumPhotos,
  createAlbum,
  deleteAlbum,
  fetchAlbum,
  fetchAlbumPhotos,
  fetchAlbums,
  fetchPhotoAlbumIds,
  removeAlbumPhoto,
  renameAlbum,
} from "./api";
import type { Album } from "./types";

export const albumKeys = {
  all: ["albums"] as const,
  group: (groupId: string) => [...albumKeys.all, "group", groupId] as const,
  detail: (albumId: string) => [...albumKeys.all, "detail", albumId] as const,
  photos: (albumId: string) => [...albumKeys.all, "photos", albumId] as const,
  photoAlbumIds: () => [...albumKeys.all, "of-photo"] as const,
  ofPhoto: (photoId: string) => [...albumKeys.photoAlbumIds(), photoId] as const,
};

const allPhotos = (data: InfiniteData<PhotoPage, string | null>): Photo[] => data.pages.flatMap((page) => page.photos);

export function useAlbums(groupId: string) {
  return useQuery({
    queryKey: albumKeys.group(groupId),
    queryFn: ({ signal }) => fetchAlbums(groupId, signal),
  });
}

export function useAlbum(albumId: string) {
  return useQuery({
    queryKey: albumKeys.detail(albumId),
    queryFn: ({ signal }) => fetchAlbum(albumId, signal),
  });
}

/** An album's photos, oldest first, a page at a time. */
export function useAlbumPhotos(albumId: string) {
  return useInfiniteQuery({
    queryKey: albumKeys.photos(albumId),
    queryFn: ({ pageParam, signal }) => fetchAlbumPhotos(albumId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: allPhotos,
  });
}

export function usePhotoAlbumIds(photoId: string, enabled: boolean) {
  return useQuery({
    queryKey: albumKeys.ofPhoto(photoId),
    queryFn: ({ signal }) => fetchPhotoAlbumIds(photoId, signal),
    enabled,
  });
}

/** After an album changed: keep its detail, and refresh the lists it appears in. */
function albumChanged(queryClient: QueryClient, album: Album) {
  queryClient.setQueryData(albumKeys.detail(album.id), album);
  void queryClient.invalidateQueries({ queryKey: albumKeys.group(album.groupId) });
}

export function useCreateAlbum(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createAlbum(groupId, name),
    onSuccess: (album) => albumChanged(queryClient, album),
  });
}

export function useRenameAlbum(albumId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameAlbum(albumId, name),
    onSuccess: (album) => albumChanged(queryClient, album),
  });
}

export function useDeleteAlbum(album: Pick<Album, "id" | "groupId">) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteAlbum(album.id),
    onSuccess: () => {
      // Only marked stale: the album page is still on screen until the caller navigates
      // away, and removing its data would make it fetch the deleted album again (404).
      for (const queryKey of [albumKeys.detail(album.id), albumKeys.photos(album.id)]) {
        void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
      }
      void queryClient.invalidateQueries({ queryKey: albumKeys.group(album.groupId) });
      void queryClient.invalidateQueries({ queryKey: albumKeys.photoAlbumIds() });
    },
  });
}

/** After photos went in or out of an album. */
function albumPhotosChanged(queryClient: QueryClient, album: Album) {
  albumChanged(queryClient, album);
  void queryClient.invalidateQueries({ queryKey: albumKeys.photos(album.id) });
  void queryClient.invalidateQueries({ queryKey: albumKeys.photoAlbumIds() });
}

/** Adds photos to an album, from its photo picker. */
export function useAddToAlbum(albumId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoIds: string[]) => addAlbumPhotos(albumId, photoIds),
    onSuccess: (album) => albumPhotosChanged(queryClient, album),
  });
}

/** Puts one photo in an album or takes it out, from the photo viewer. The tick shows straight away. */
export function usePhotoAlbumToggle(photoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ albumId, add }: { albumId: string; add: boolean }) =>
      add ? addAlbumPhotos(albumId, [photoId]) : removeAlbumPhoto(albumId, photoId),
    onMutate: ({ albumId, add }) => {
      queryClient.setQueryData<string[]>(
        albumKeys.ofPhoto(photoId),
        (ids) => ids && (add ? [...ids, albumId] : ids.filter((id) => id !== albumId)),
      );
    },
    onSuccess: (album) => albumPhotosChanged(queryClient, album),
    onError: () => void queryClient.invalidateQueries({ queryKey: albumKeys.ofPhoto(photoId) }),
  });
}

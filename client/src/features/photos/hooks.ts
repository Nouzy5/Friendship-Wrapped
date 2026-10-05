import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deletePhoto, fetchGroupPhotos, fetchPhoto, uploadPhoto } from "./api";
import type { Photo } from "./types";

export const photoKeys = {
  all: ["photos"] as const,
  group: (groupId: string) => [...photoKeys.all, "group", groupId] as const,
  detail: (photoId: string) => [...photoKeys.all, "detail", photoId] as const,
};

/** The group's newest photos (the first page; the paginated feed comes with Phase 5). */
export function useGroupPhotos(groupId: string) {
  return useQuery({
    queryKey: photoKeys.group(groupId),
    queryFn: ({ signal }) => fetchGroupPhotos(groupId, signal),
  });
}

export function usePhoto(photoId: string) {
  return useQuery({
    queryKey: photoKeys.detail(photoId),
    queryFn: ({ signal }) => fetchPhoto(photoId, signal),
  });
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadPhoto,
    onSuccess: (photo) => {
      void queryClient.invalidateQueries({ queryKey: photoKeys.group(photo.groupId) });
    },
  });
}

export function useDeletePhoto(photo: Pick<Photo, "id" | "groupId">) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deletePhoto(photo.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: photoKeys.detail(photo.id) });
      void queryClient.invalidateQueries({ queryKey: photoKeys.group(photo.groupId) });
    },
  });
}

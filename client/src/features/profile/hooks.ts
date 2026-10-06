import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { sessionQueryKey } from "../../lib/query-client";
import type { User } from "../auth/types";
import { groupKeys } from "../groups/hooks";
import { photoKeys } from "../photos/cache";
import { removeAvatar, updateProfile, uploadAvatar } from "./api";

/** Your name and picture appear in member lists and on photos too, so refresh those. */
function applyUpdatedUser(queryClient: QueryClient, user: User) {
  queryClient.setQueryData(sessionQueryKey, user);
  void queryClient.invalidateQueries({ queryKey: groupKeys.all });
  void queryClient.invalidateQueries({ queryKey: photoKeys.all });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (user) => applyUpdatedUser(queryClient, user),
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (user) => applyUpdatedUser(queryClient, user),
  });
}

export function useRemoveAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeAvatar,
    onSuccess: (user) => applyUpdatedUser(queryClient, user),
  });
}

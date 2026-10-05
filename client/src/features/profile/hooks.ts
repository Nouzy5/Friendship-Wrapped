import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionQueryKey } from "../../lib/query-client";
import { updateProfile } from "./api";

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (user) => queryClient.setQueryData(sessionQueryKey, user),
  });
}

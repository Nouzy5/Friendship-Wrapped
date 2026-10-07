import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { groupKeys } from "../groups/hooks";
import { wrappedKeys } from "../wrapped/hooks";
import { acceptInvite, createInvite, fetchInvitePreview, resetInvites } from "./api";

/** Keyed by viewer too: whether you're already a member depends on who's signed in. */
export function useInvitePreview(token: string, viewerId: string | null) {
  return useQuery({
    queryKey: ["invites", token, viewerId],
    queryFn: ({ signal }) => fetchInvitePreview(token, signal),
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptInvite,
    onSuccess: (group) => {
      queryClient.setQueryData(groupKeys.detail(group.id), group);
      void queryClient.invalidateQueries({ queryKey: groupKeys.list() });
      // The group's Wrapped are yours now too.
      void queryClient.invalidateQueries({ queryKey: wrappedKeys.all });
    },
  });
}

export function useCreateInvite(groupId: string) {
  return useMutation({ mutationFn: () => createInvite(groupId) });
}

export function useResetInvites(groupId: string) {
  return useMutation({ mutationFn: () => resetInvites(groupId) });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGroup,
  fetchGroup,
  fetchGroupMembers,
  fetchMyGroups,
  leaveGroup,
  removeMember,
  updateGroup,
} from "./api";
import { wrappedKeys } from "../wrapped/hooks";
import type { GroupInput } from "./types";

export const groupKeys = {
  all: ["groups"] as const,
  list: () => [...groupKeys.all, "list"] as const,
  detail: (groupId: string) => [...groupKeys.all, "detail", groupId] as const,
  members: (groupId: string) => [...groupKeys.all, "members", groupId] as const,
};

export function useMyGroups() {
  return useQuery({
    queryKey: groupKeys.list(),
    queryFn: ({ signal }) => fetchMyGroups(signal),
  });
}

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: ({ signal }) => fetchGroup(groupId, signal),
  });
}

export function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: groupKeys.members(groupId),
    queryFn: ({ signal }) => fetchGroupMembers(groupId, signal),
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createGroup,
    onSuccess: (group) => {
      queryClient.setQueryData(groupKeys.detail(group.id), group);
      void queryClient.invalidateQueries({ queryKey: groupKeys.list() });
    },
  });
}

export function useUpdateGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<GroupInput>) => updateGroup(groupId, input),
    onSuccess: (group) => {
      queryClient.setQueryData(groupKeys.detail(groupId), group);
      void queryClient.invalidateQueries({ queryKey: groupKeys.list() });
    },
  });
}

/** Callers navigate away on success; the group's cached detail then expires on its own. */
export function useLeaveGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => leaveGroup(groupId),
    onSuccess: () => {
      queryClient.setQueryData(groupKeys.list(), (groups: { id: string }[] | undefined) =>
        groups?.filter((group) => group.id !== groupId),
      );
      void queryClient.invalidateQueries({ queryKey: groupKeys.list() });
      void queryClient.invalidateQueries({ queryKey: wrappedKeys.all });
    },
  });
}

export function useRemoveMember(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(groupId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) });
      void queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
      void queryClient.invalidateQueries({ queryKey: groupKeys.list() });
    },
  });
}

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { MemberColor } from "../../lib/member-colors";
import {
  createGroup,
  fetchGroup,
  fetchGroupMembers,
  fetchMyGroups,
  leaveGroup,
  removeGroupAvatar,
  removeMember,
  updateGroup,
  updateMyMembership,
  uploadGroupAvatar,
  type MembershipInput,
} from "./api";
import { wrappedKeys } from "../wrapped/hooks";
import type { Group, GroupInput, GroupMember } from "./types";

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

export function useGroupMembers(groupId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: groupKeys.members(groupId),
    queryFn: ({ signal }) => fetchGroupMembers(groupId, signal),
    enabled,
    staleTime: 60_000,
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

/** After your colour, mute or the group photo changes: the group everywhere, and the members (your colour). */
function applyUpdatedGroup(queryClient: QueryClient, group: Group) {
  queryClient.setQueryData(groupKeys.detail(group.id), group);
  queryClient.setQueryData(groupKeys.list(), (groups: Group[] | undefined) =>
    groups?.map((other) => (other.id === group.id ? group : other)),
  );
  void queryClient.invalidateQueries({ queryKey: groupKeys.members(group.id) });
}

export function useUpdateMyMembership(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MembershipInput) => updateMyMembership(groupId, input),
    onSuccess: (group) => applyUpdatedGroup(queryClient, group),
  });
}

export function useUploadGroupAvatar(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (image: Blob) => uploadGroupAvatar(groupId, image),
    onSuccess: (group) => applyUpdatedGroup(queryClient, group),
  });
}

export function useRemoveGroupAvatar(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => removeGroupAvatar(groupId),
    onSuccess: (group) => applyUpdatedGroup(queryClient, group),
  });
}

/**
 * Who's who in a group: each member's name and colour, so photos, reactions and comments can show
 * them. People who have left aren't in the list (`memberOf` gives undefined) and come out neutral.
 */
export function useGroupPeople(groupId: string | undefined) {
  const members = useGroupMembers(groupId ?? "", { enabled: Boolean(groupId) });
  const byId = useMemo(() => new Map((members.data ?? []).map((member) => [member.user.id, member])), [members.data]);
  const memberOf = useCallback((userId: string): GroupMember | undefined => byId.get(userId), [byId]);
  const colorOf = useCallback((userId: string): MemberColor | null => byId.get(userId)?.color ?? null, [byId]);
  return { memberOf, colorOf, members: members.data };
}

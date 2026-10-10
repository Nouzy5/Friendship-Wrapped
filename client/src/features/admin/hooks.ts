import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteGroup,
  deleteUser,
  fetchGroup,
  fetchGroups,
  fetchOverview,
  fetchReports,
  fetchSystem,
  fetchUser,
  fetchUsers,
  markEmailVerified,
  removeGroupMember,
  resendVerification,
  sendTestEmail,
  signOutEverywhere,
  type UserFilter,
} from "./api";

export const adminKeys = {
  all: ["admin"] as const,
  overview: () => [...adminKeys.all, "overview"] as const,
  users: () => [...adminKeys.all, "users"] as const,
  userList: (q: string, filter: UserFilter) => [...adminKeys.users(), "list", q, filter] as const,
  user: (userId: string) => [...adminKeys.users(), "detail", userId] as const,
  groups: () => [...adminKeys.all, "groups"] as const,
  groupList: (q: string) => [...adminKeys.groups(), "list", q] as const,
  group: (groupId: string) => [...adminKeys.groups(), "detail", groupId] as const,
  reports: () => [...adminKeys.all, "reports"] as const,
  system: () => [...adminKeys.all, "system"] as const,
};

/** The admin looks at live numbers: nothing is kept for long. */
const FRESH_FOR_MS = 15_000;

export function useOverview() {
  return useQuery({ queryKey: adminKeys.overview(), queryFn: ({ signal }) => fetchOverview(signal), staleTime: FRESH_FOR_MS });
}

export function useAdminUsers(q: string, filter: UserFilter) {
  return useInfiniteQuery({
    queryKey: adminKeys.userList(q, filter),
    queryFn: ({ pageParam, signal }) => fetchUsers({ q, filter, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data) => data.pages.flatMap((page) => page.users),
    staleTime: FRESH_FOR_MS,
  });
}

export function useAdminUser(userId: string) {
  return useQuery({ queryKey: adminKeys.user(userId), queryFn: ({ signal }) => fetchUser(userId, signal), staleTime: FRESH_FOR_MS });
}

export function useAdminGroups(q: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.groupList(q),
    queryFn: ({ pageParam, signal }) => fetchGroups({ q, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data) => data.pages.flatMap((page) => page.groups),
    staleTime: FRESH_FOR_MS,
  });
}

export function useAdminGroup(groupId: string) {
  return useQuery({ queryKey: adminKeys.group(groupId), queryFn: ({ signal }) => fetchGroup(groupId, signal), staleTime: FRESH_FOR_MS });
}

export function useAdminReports() {
  return useInfiniteQuery({
    queryKey: adminKeys.reports(),
    queryFn: ({ pageParam, signal }) => fetchReports({ cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data) => data.pages.flatMap((page) => page.reports),
    staleTime: FRESH_FOR_MS,
  });
}

export function useSystemReport() {
  return useQuery({ queryKey: adminKeys.system(), queryFn: ({ signal }) => fetchSystem(signal), staleTime: FRESH_FOR_MS });
}

/** Marking an address verified changes the person's row, their page, and the overview's counts. */
export function useMarkEmailVerified(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markEmailVerified(userId),
    onSuccess: (detail) => {
      queryClient.setQueryData(adminKeys.user(userId), detail);
      void queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      void queryClient.invalidateQueries({ queryKey: adminKeys.overview() });
      void queryClient.invalidateQueries({ queryKey: adminKeys.system() });
    },
  });
}

export function useResendVerification(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resendVerification(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.user(userId) }),
  });
}

export function useSignOutEverywhere(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => signOutEverywhere(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.user(userId) }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUser,
    onSuccess: (_data, { userId }) => {
      queryClient.removeQueries({ queryKey: adminKeys.user(userId) });
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
}

export function useRemoveGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeGroupMember,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteGroup,
    onSuccess: (_data, { groupId }) => {
      queryClient.removeQueries({ queryKey: adminKeys.group(groupId) });
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
}

export function useSendTestEmail() {
  return useMutation({ mutationFn: sendTestEmail });
}

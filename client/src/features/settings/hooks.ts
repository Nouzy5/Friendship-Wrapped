import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionQueryKey } from "../../lib/query-client";
import type { User } from "../auth/types";
import { groupKeys } from "../groups/hooks";
import { photoKeys } from "../photos/cache";
import {
  blockPerson,
  changePassword,
  fetchBlocked,
  fetchMyInvites,
  fetchSessions,
  fetchSettings,
  revokeInvite,
  sendReport,
  signOutDevice,
  signOutOtherDevices,
  unblockPerson,
  updateSettings,
  updateUsername,
} from "./api";
import type { UserSettings, UserSettingsChanges } from "./types";

export const settingsKeys = {
  all: ["settings"] as const,
  account: () => [...settingsKeys.all, "account"] as const,
  sessions: () => [...settingsKeys.all, "sessions"] as const,
  invites: () => [...settingsKeys.all, "invites"] as const,
  blocked: () => [...settingsKeys.all, "blocked"] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.account(),
    queryFn: ({ signal }) => fetchSettings(signal),
    staleTime: 5 * 60_000,
  });
}

function merge(settings: UserSettings, changes: UserSettingsChanges): UserSettings {
  const { notifications, ...rest } = changes;
  return {
    ...settings,
    ...rest,
    notifications: {
      ...settings.notifications,
      ...notifications,
      quietHours: { ...settings.notifications.quietHours, ...notifications?.quietHours },
    },
  };
}

/** Switches flip at once; if saving fails they flip back and a toast says so. */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys.account() });
      const before = queryClient.getQueryData<UserSettings>(settingsKeys.account());
      if (before) queryClient.setQueryData(settingsKeys.account(), merge(before, changes));
      return { before };
    },
    onError: (_error, _changes, context) => {
      if (context?.before) queryClient.setQueryData(settingsKeys.account(), context.before);
    },
    onSuccess: (settings) => queryClient.setQueryData(settingsKeys.account(), settings),
    meta: { errorToast: "Couldn't save that setting." },
  });
}

export function useUpdateUsername() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateUsername,
    onSuccess: (user: User) => {
      queryClient.setQueryData(sessionQueryKey, user);
      void queryClient.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: changePassword,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: settingsKeys.sessions() }),
  });
}

export function useSessions() {
  return useQuery({ queryKey: settingsKeys.sessions(), queryFn: ({ signal }) => fetchSessions(signal) });
}

export function useSignOutDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signOutDevice,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: settingsKeys.sessions() }),
    meta: { errorToast: "Couldn't sign out that device." },
  });
}

export function useSignOutOtherDevices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signOutOtherDevices,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: settingsKeys.sessions() }),
    meta: { errorToast: "Couldn't sign out your other devices." },
  });
}

export function useMyInvites() {
  return useQuery({ queryKey: settingsKeys.invites(), queryFn: ({ signal }) => fetchMyInvites(signal) });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: settingsKeys.invites() }),
    meta: { errorToast: "Couldn't turn off that link." },
  });
}

export function useBlocked() {
  return useQuery({ queryKey: settingsKeys.blocked(), queryFn: ({ signal }) => fetchBlocked(signal) });
}

/** Their photos, comments and reactions disappear from what you see (and yours from theirs). */
function refreshAfterBlockChange(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: settingsKeys.blocked() });
  void queryClient.invalidateQueries({ queryKey: photoKeys.all });
}

export function useBlockPerson() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: blockPerson, onSuccess: () => refreshAfterBlockChange(queryClient) });
}

export function useUnblockPerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unblockPerson,
    onSuccess: () => refreshAfterBlockChange(queryClient),
    meta: { errorToast: "Couldn't unblock them." },
  });
}

export function useSendReport() {
  return useMutation({ mutationFn: sendReport });
}

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { sessionQueryKey } from "../../lib/query-client";
import { fetchSessionUser, login, logout, register } from "./api";
import { forgetCurrentGroup } from "../groups/current-group";
import { clearSavedPhotos, turnOffPush } from "../notifications/push";
import { markSignedOut } from "./sign-out";
import type { User } from "./types";

/** The signed-in user, `null` when signed out. */
export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: ({ signal }) => fetchSessionUser(signal),
    staleTime: 5 * 60_000,
  });
}

/** The signed-in user. Only call this inside routes guarded by `<RequireAuth>`. */
export function useCurrentUser(): User {
  const { data } = useSession();
  if (!data) throw new Error("useCurrentUser must be used inside <RequireAuth>");
  return data;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => queryClient.setQueryData(sessionQueryKey, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: register,
    onSuccess: (user) => queryClient.setQueryData(sessionQueryKey, user),
  });
}

/** Signs out locally: no session, and nothing cached from this account for the next one to see. */
export function forgetSignedInUser(queryClient: QueryClient): void {
  forgetCurrentGroup();
  void clearSavedPhotos();
  queryClient.setQueryData(sessionQueryKey, null);
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionQueryKey[0] });
}

/** The auth guard then shows the login page. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    // This device stops getting your notifications before the session ends.
    mutationFn: async () => {
      await turnOffPush();
      await logout();
    },
    onSuccess: () => {
      markSignedOut("logout");
      forgetSignedInUser(queryClient);
    },
  });
}

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { sessionQueryKey } from "../../lib/query-client";
import { changeEmail, fetchSessionUser, login, logout, register, resendVerificationEmail, verifyEmail } from "./api";
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
    onSuccess: (user) => rememberSignedInUser(queryClient, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: register,
    onSuccess: (user) => rememberSignedInUser(queryClient, user),
  });
}

/** Adds or changes the email address. The session then says it's unverified, and the app asks for the link. */
export function useChangeEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: changeEmail,
    onSuccess: (user) => queryClient.setQueryData(sessionQueryKey, user),
  });
}

export function useResendVerificationEmail() {
  return useMutation({ mutationFn: resendVerificationEmail });
}

/** Opens a link from the confirmation email, then refreshes who's signed in (they may be let in now). */
export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: verifyEmail,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
  });
}

/** Everything cached for the signed-in account (all but the session itself). */
function forgetAccountData(queryClient: QueryClient): void {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionQueryKey[0] });
}

/**
 * Signs in locally. A session that expired leaves its account's data cached (only
 * signing out clears it), so it's dropped here: whoever signs in next never sees it.
 */
function rememberSignedInUser(queryClient: QueryClient, user: User): void {
  forgetAccountData(queryClient);
  queryClient.setQueryData(sessionQueryKey, user);
}

/** Signs out locally: no session, and nothing cached from this account for the next one to see. */
export function forgetSignedInUser(queryClient: QueryClient): void {
  forgetCurrentGroup();
  void clearSavedPhotos();
  queryClient.setQueryData(sessionQueryKey, null);
  forgetAccountData(queryClient);
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

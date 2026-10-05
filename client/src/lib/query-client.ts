import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-client";

/** Cache key for the signed-in user (`null` when signed out). */
export const sessionQueryKey = ["auth", "session"] as const;

/** Any request rejected for a missing/expired session signs the user out locally. */
function handleSessionExpiry(error: Error): void {
  if (error instanceof ApiError && error.status === 401 && error.code === "UNAUTHORIZED") {
    queryClient.setQueryData(sessionQueryKey, null);
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleSessionExpiry }),
  mutationCache: new MutationCache({ onError: handleSessionExpiry }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Client errors (4xx) won't succeed on retry; network/5xx errors might.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

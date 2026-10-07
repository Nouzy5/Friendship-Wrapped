import { useQuery } from "@tanstack/react-query";
import { browserTimeZone } from "../../lib/time-zone";
import { fetchWrapped, fetchWrappedList } from "./api";

/**
 * Invalidate `all` whenever photos come or go, or you join or leave a group: the list
 * (and so whether the Wrapped tab shows) and this year's live numbers change with them.
 */
export const wrappedKeys = {
  all: ["wrapped"] as const,
  list: (timeZone: string) => [...wrappedKeys.all, "list", timeZone] as const,
  detail: (groupId: string, year: number, timeZone: string) =>
    [...wrappedKeys.all, "detail", groupId, year, timeZone] as const,
};

export function useWrappedList() {
  const timeZone = browserTimeZone();
  return useQuery({
    queryKey: wrappedKeys.list(timeZone),
    queryFn: ({ signal }) => fetchWrappedList(timeZone, signal),
  });
}

export function useWrapped(groupId: string, year: number) {
  const timeZone = browserTimeZone();
  return useQuery({
    queryKey: wrappedKeys.detail(groupId, year, timeZone),
    queryFn: ({ signal }) => fetchWrapped(groupId, year, timeZone, signal),
  });
}

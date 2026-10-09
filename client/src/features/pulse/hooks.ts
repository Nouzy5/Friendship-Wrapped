import { useQuery } from "@tanstack/react-query";
import { browserTimeZone } from "../../lib/time-zone";
import { fetchGroupPulse } from "./api";

/** Invalidate `all` whenever photos come or go: the month's numbers and the streak change with them. */
export const pulseKeys = {
  all: ["pulse"] as const,
  group: (groupId: string, timeZone: string) => [...pulseKeys.all, groupId, timeZone] as const,
};

export function useGroupPulse(groupId: string) {
  const timeZone = browserTimeZone();
  return useQuery({
    queryKey: pulseKeys.group(groupId, timeZone),
    queryFn: ({ signal }) => fetchGroupPulse(groupId, timeZone, signal),
  });
}

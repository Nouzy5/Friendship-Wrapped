import { useQuery } from "@tanstack/react-query";
import { browserTimeZone } from "../../lib/time-zone";
import { fetchOnThisDay } from "./api";

export const onThisDayKeys = {
  group: (groupId: string) => ["memories", "on-this-day", groupId] as const,
};

/** Today's local date, so the answer refreshes after midnight. */
const localDate = () => new Date().toLocaleDateString("en-CA");

export function useOnThisDay(groupId: string) {
  const zone = browserTimeZone();
  const date = localDate();
  return useQuery({
    queryKey: [...onThisDayKeys.group(groupId), zone, date],
    // The date is sent too, so the photos are for the day the heading shows.
    queryFn: ({ signal }) => fetchOnThisDay(groupId, zone, date, signal),
  });
}

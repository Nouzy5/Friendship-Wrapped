import { useQuery } from "@tanstack/react-query";
import { browserTimeZone } from "../../lib/time-zone";
import { fetchOnThisDay } from "./api";

/** Today's local date, so the answer refreshes after midnight. */
const localDate = () => new Date().toLocaleDateString("en-CA");

export function useOnThisDay(groupId: string) {
  const zone = browserTimeZone();
  return useQuery({
    queryKey: ["memories", "on-this-day", groupId, zone, localDate()],
    queryFn: ({ signal }) => fetchOnThisDay(groupId, zone, signal),
  });
}

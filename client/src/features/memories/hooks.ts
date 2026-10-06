import { useQuery } from "@tanstack/react-query";
import { fetchOnThisDay } from "./api";

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Today's local date, so the answer refreshes after midnight. */
const localDate = () => new Date().toLocaleDateString("en-CA");

export function useOnThisDay(groupId: string) {
  const zone = timeZone();
  return useQuery({
    queryKey: ["memories", "on-this-day", groupId, zone, localDate()],
    queryFn: ({ signal }) => fetchOnThisDay(groupId, zone, signal),
  });
}

import { apiRequest } from "../../lib/api-client";
import type { Photo } from "../photos/types";

export type OnThisDay = {
  /** The day looked back from, "YYYY-MM-DD". */
  date: string;
  /** Newest year first; only years that have photos. */
  years: { year: number; photos: Photo[] }[];
};

/** Photos from today's date in earlier years, by the browser's time zone. */
export function fetchOnThisDay(groupId: string, timeZone: string, signal?: AbortSignal): Promise<OnThisDay> {
  const query = new URLSearchParams({ tz: timeZone });
  return apiRequest<OnThisDay>(`/groups/${encodeURIComponent(groupId)}/photos/on-this-day?${query}`, { signal });
}

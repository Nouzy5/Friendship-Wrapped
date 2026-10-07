import { apiRequest } from "../../lib/api-client";
import type { Wrapped, WrappedSummary } from "./types";

/** Every Wrapped you can open, newest year first; years are counted in `timeZone`. */
export async function fetchWrappedList(timeZone: string, signal?: AbortSignal): Promise<WrappedSummary[]> {
  const query = new URLSearchParams({ tz: timeZone });
  const { wrapped } = await apiRequest<{ wrapped: WrappedSummary[] }>(`/wrapped?${query}`, { signal });
  return wrapped;
}

export async function fetchWrapped(
  groupId: string,
  year: number,
  timeZone: string,
  signal?: AbortSignal,
): Promise<Wrapped> {
  const query = new URLSearchParams({ tz: timeZone });
  const { wrapped } = await apiRequest<{ wrapped: Wrapped }>(
    `/groups/${encodeURIComponent(groupId)}/wrapped/${year}?${query}`,
    { signal },
  );
  return wrapped;
}

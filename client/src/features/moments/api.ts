import { ApiError, apiRequest } from "../../lib/api-client";
import type { PhotoPage } from "../photos/types";
import type { Moment, MomentPage, NewMoment } from "./types";

const momentPath = (momentId: string) => `/moments/${encodeURIComponent(momentId)}`;
const groupMomentsPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/moments`;

/** One page of a group's moments, newest first. */
export function fetchMoments(groupId: string, cursor: string | null, signal?: AbortSignal): Promise<MomentPage> {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  return apiRequest<MomentPage>(`${groupMomentsPath(groupId)}${query}`, { signal });
}

/** The moment taking photos now, or null. */
export async function fetchOpenMoment(groupId: string, signal?: AbortSignal): Promise<Moment | null> {
  const { moment } = await apiRequest<{ moment: Moment | null }>(`${groupMomentsPath(groupId)}/open`, { signal });
  return moment;
}

export async function fetchMoment(momentId: string, signal?: AbortSignal): Promise<Moment> {
  const { moment } = await apiRequest<{ moment: Moment }>(momentPath(momentId), { signal });
  return moment;
}

/** One page of a moment's photos, oldest first. */
export function fetchMomentPhotos(momentId: string, cursor: string | null, signal?: AbortSignal): Promise<PhotoPage> {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  return apiRequest<PhotoPage>(`${momentPath(momentId)}/photos${query}`, { signal });
}

export async function startMoment(groupId: string, moment: NewMoment): Promise<Moment> {
  const body: Record<string, unknown> = { title: moment.title, durationHours: moment.durationHours };
  if (moment.emoji) body.emoji = moment.emoji;
  const result = await apiRequest<{ moment: Moment }>(groupMomentsPath(groupId), { method: "POST", body });
  return result.moment;
}

export async function endMoment(momentId: string): Promise<Moment> {
  const { moment } = await apiRequest<{ moment: Moment }>(`${momentPath(momentId)}/end`, { method: "POST" });
  return moment;
}

export async function deleteMoment(momentId: string): Promise<void> {
  await apiRequest<null>(momentPath(momentId), { method: "DELETE" });
}

/** True when posting into a moment was refused because it closed meanwhile. */
export function isMomentEndedError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "MOMENT_ENDED";
}

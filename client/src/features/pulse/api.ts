import { apiRequest } from "../../lib/api-client";

/**
 * How a group is doing: numbers about the group, never about individuals. In particular there is
 * nothing about who has or hasn't posted.
 */
export type GroupPulse = {
  timeZone: string;
  /** The calendar month it is now, in the viewer's zone. */
  month: {
    year: number;
    /** 1–12 */
    month: number;
    from: string;
    to: string;
    photos: number;
    reactions: number;
    comments: number;
  };
  /** Weeks (Monday to Sunday) in a row with at least one photo from the group. */
  streak: {
    weeks: number;
    /** False while this week has no photo yet; the streak is alive until the week ends. */
    thisWeekDone: boolean;
  };
};

export async function fetchGroupPulse(groupId: string, timeZone: string, signal?: AbortSignal): Promise<GroupPulse> {
  const query = new URLSearchParams({ tz: timeZone });
  const { pulse } = await apiRequest<{ pulse: GroupPulse }>(`/groups/${encodeURIComponent(groupId)}/pulse?${query}`, {
    signal,
  });
  return pulse;
}

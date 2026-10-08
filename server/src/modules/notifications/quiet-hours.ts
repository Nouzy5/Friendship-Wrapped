import { addDays, instantIn, localTimeIn } from "../../lib/time-zone.js";
import type { UserSettings } from "../settings/settings.dto.js";

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
};

/**
 * When the person's quiet hours end, if `now` falls inside them; null when it doesn't (or
 * they have none, or no time zone to tell their local time by). A window may run past
 * midnight, e.g. 23:00–08:00; one that starts and ends at the same time is empty.
 */
export function quietHoursEnd({ timeZone, notifications: { quietHours } }: UserSettings, now: Date): Date | null {
  if (!quietHours.enabled || !timeZone) return null;

  const start = minutesOf(quietHours.start);
  const end = minutesOf(quietHours.end);
  if (start === end) return null;

  const { date, minutes } = localTimeIn(now, timeZone);
  const inside = start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  if (!inside) return null;

  // Before the end today, or (in a window past midnight, after its start) tomorrow.
  return instantIn(minutes < end ? date : addDays(date, 1), end, timeZone);
}

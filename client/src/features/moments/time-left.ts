import { formatRelativeTime } from "../../lib/format";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "Ends in 2 h 10 min", "Ends in 40 min", or, once over, "Ended yesterday". */
export function describeMomentEnd(endsAt: string, isOpen: boolean, now = new Date()): string {
  const remaining = new Date(endsAt).getTime() - now.getTime();
  if (!isOpen || remaining <= 0) return `Ended ${formatRelativeTime(endsAt, now).toLowerCase()}`;
  if (remaining < MINUTE) return "Ends in under a minute";
  if (remaining < HOUR) return `Ends in ${Math.ceil(remaining / MINUTE)} min`;
  // Long spans to the nearest hour (12 hours reads "12 h" a moment after starting); short ones to the minute.
  if (remaining >= 6 * HOUR) return `Ends in ${Math.round(remaining / HOUR)} h`;
  const hours = Math.floor(remaining / HOUR);
  const minutes = Math.round((remaining - hours * HOUR) / MINUTE);
  return minutes === 0 ? `Ends in ${hours} h` : `Ends in ${hours} h ${minutes} min`;
}

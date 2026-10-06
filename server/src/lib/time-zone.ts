/**
 * Calendar days in a person's own time zone (IANA names such as "Europe/Bratislava").
 * Photos are stored with UTC instants; "the same day last year" has to be worked out
 * where the person is, or late-evening photos land on the wrong day.
 */
export type CalendarDate = { year: number; month: number; day: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    wallClockFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock reading in the zone at `instant`, as numbers. */
function wallClock(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    wallClockFormatter(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)]),
  );
  return parts as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

/** How far the zone's clocks are ahead of UTC at `instant`. */
function offsetMs(instant: Date, timeZone: string): number {
  const clock = wallClock(instant, timeZone);
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Today's date in the zone. */
export function todayIn(timeZone: string, now = new Date()): CalendarDate {
  const { year, month, day } = wallClock(now, timeZone);
  return { year, month, day };
}

/** False for dates that don't exist, such as 29 February in most years. */
export function isRealDate({ year, month, day }: CalendarDate): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The instant a calendar day begins in the zone (its local midnight), and the next day's. */
export function dayRangeIn({ year, month, day }: CalendarDate, timeZone: string): { from: Date; to: Date } {
  const startOf = (dayOfMonth: number) => {
    const wallMidnight = Date.UTC(year, month - 1, dayOfMonth);
    // The offset can change across a DST switch, so check it again at the corrected instant.
    const first = wallMidnight - offsetMs(new Date(wallMidnight), timeZone);
    return new Date(wallMidnight - offsetMs(new Date(first), timeZone));
  };
  return { from: startOf(day), to: startOf(day + 1) };
}

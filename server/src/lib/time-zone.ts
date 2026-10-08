/**
 * Calendar days in a person's own time zone (IANA names such as "Europe/Bratislava").
 * Photos are stored with UTC instants; "the same day last year" has to be worked out
 * where the person is, or late-evening photos land on the wrong day.
 */
export type CalendarDate = { year: number; month: number; day: number };

/**
 * One formatter per zone (they're slow to create and hold ICU data), found through the
 * spelling that was asked for. Zone names ignore case and have aliases, so a formatter
 * per spelling ("eUrOpE/bRaTiSlAvA", …) would let anyone grow memory without limit:
 * spellings only map to a canonical name, and both maps are capped as a backstop.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();
const canonicalNames = new Map<string, string>();
const MAX_CACHED = 1_000;

function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  const known = canonicalNames.get(timeZone);
  const cached = known === undefined ? undefined : formatters.get(known);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const canonical = formatter.resolvedOptions().timeZone;
  if (canonicalNames.size >= MAX_CACHED) canonicalNames.clear();
  canonicalNames.set(timeZone, canonical);
  if (!formatters.has(canonical)) {
    if (formatters.size >= MAX_CACHED) formatters.clear();
    formatters.set(canonical, formatter);
  }
  return formatters.get(canonical)!;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    wallClockFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The zone's canonical name ("europe/bratislava" → "Europe/Bratislava", "Etc/UTC" → "UTC"). Call with a valid zone. */
export function canonicalTimeZone(timeZone: string): string {
  return wallClockFormatter(timeZone).resolvedOptions().timeZone;
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

/** The year it is in the zone at `instant`. */
export function yearIn(instant: Date, timeZone: string): number {
  return wallClock(instant, timeZone).year;
}

/** From the local midnight starting `year` in the zone to the one starting the next year. */
export function yearRangeIn(year: number, timeZone: string): { from: Date; to: Date } {
  return {
    from: dayRangeIn({ year, month: 1, day: 1 }, timeZone).from,
    to: dayRangeIn({ year: year + 1, month: 1, day: 1 }, timeZone).from,
  };
}

/** False for dates that don't exist, such as 29 February in most years. */
export function isRealDate({ year, month, day }: CalendarDate): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * The local midnight starting each day of `year` in the zone, then the one starting
 * the next year: 366 instants (367 in a leap year). Day `i` runs from `[i]` to `[i + 1]`.
 */
export function dayStartsOfYear(year: number, timeZone: string): Date[] {
  const starts: Date[] = [];
  for (let index = 0; ; index++) {
    const wallMidnight = Date.UTC(year, 0, 1 + index);
    starts.push(new Date(startOfDay(wallMidnight, timeZone)));
    if (new Date(wallMidnight).getUTCFullYear() !== year) return starts;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The zone's wall-clock date at `instant`, as a UTC midnight (so dates compare as numbers). */
function wallDate(instant: number, timeZone: string): number {
  const { year, month, day } = wallClock(new Date(instant), timeZone);
  return Date.UTC(year, month - 1, day);
}

/**
 * The first instant of a calendar day in the zone. `wallMidnight` is the day as a UTC
 * midnight; the zone's midnight is that minus the zone's offset, but which offset?
 * - Usually the same one before and after, and it reads exactly midnight.
 * - When clocks go back over midnight, midnight happens twice: the first one counts.
 * - When clocks spring forward over midnight (Chile, Cuba, the Azores), there's no
 *   midnight at all: the day starts at the jump, e.g. 23:59:59 straight to 01:00.
 */
function startOfDay(wallMidnight: number, timeZone: string): number {
  // The offsets a day either side: a zone changes its clocks at most once in between.
  const candidates = [
    ...new Set([wallMidnight - DAY_MS, wallMidnight + DAY_MS].map((probe) => wallMidnight - offsetMs(new Date(probe), timeZone))),
  ].sort((a, b) => a - b);

  const readsMidnight = candidates.filter((instant) => wallMidnight - offsetMs(new Date(instant), timeZone) === instant);
  if (readsMidnight.length > 0) return readsMidnight[0]!;

  // No midnight: find the jump between the candidates, to the second (the day before
  // ends at `low`, this one has begun at `high`).
  let low = candidates[0]!;
  let high = candidates.at(-1)!;
  while (high - low > 1000) {
    const middle = low + Math.floor((high - low) / 2000) * 1000;
    if (wallDate(middle, timeZone) >= wallMidnight) high = middle;
    else low = middle;
  }
  return high;
}

/** The instant a calendar day begins in the zone (its local midnight), and the next day's. */
export function dayRangeIn({ year, month, day }: CalendarDate, timeZone: string): { from: Date; to: Date } {
  const from = startOfDay(Date.UTC(year, month - 1, day), timeZone);
  const to = startOfDay(Date.UTC(year, month - 1, day + 1), timeZone);
  return { from: new Date(from), to: new Date(to) };
}

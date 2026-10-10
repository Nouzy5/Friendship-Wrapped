const monthYear = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const monthName = new Intl.DateTimeFormat(undefined, { month: "long" });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const plural = new Intl.PluralRules("en");
const wholeNumber = new Intl.NumberFormat();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** e.g. "October 2026" in the viewer's locale. */
export function formatMonthYear(isoDate: string): string {
  return monthYear.format(new Date(isoDate));
}

/** The name of a month (1–12) in the viewer's locale, e.g. "October". */
export function formatMonthName(month: number): string {
  return monthName.format(new Date(2000, month - 1, 1));
}

/** e.g. "12 Oct" in the viewer's locale. */
export function formatDayMonth(isoDate: string): string {
  return dayMonth.format(new Date(isoDate));
}

/** e.g. "5 Oct 2026, 22:59" in the viewer's locale. */
export function formatDateTime(isoDate: string): string {
  return dateTime.format(new Date(isoDate));
}

/** Calendar days from one instant's date to another's, here (DST days are 23 or 25 hours long). */
function calendarDaysBetween(earlier: Date, later: Date): number {
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((midnight(later) - midnight(earlier)) / DAY);
}

/** "now", "5 minutes ago", "yesterday", "3 days ago", then a date: "12 Oct" (or "12 Oct 2025" in another year). */
export function formatRelativeTime(isoDate: string, now = new Date()): string {
  const date = new Date(isoDate);
  const elapsed = now.getTime() - date.getTime();

  if (elapsed < MINUTE) return relative.format(0, "second");
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  // By the calendar: 23:00 the day before yesterday is "2 days ago" even if it was 26 hours ago.
  const days = calendarDaysBetween(date, now);
  if (days < 7) return relative.format(-days, "day");
  return (date.getFullYear() === now.getFullYear() ? dayMonth : dayMonthYear).format(date);
}

/** e.g. "8,421" in the viewer's locale. */
export function formatNumber(count: number): string {
  return wholeNumber.format(count);
}

/** A clip's length as a player shows it: 7 seconds is "0:07", a minute is "1:00". Rounded up, so a clip is never "0:00". */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The word to follow a count: nounFor(1, "photo") is "photo", nounFor(3, "photo") is "photos". */
export function nounFor(count: number, singular: string, pluralForm = `${singular}s`): string {
  return plural.select(count) === "one" ? singular : pluralForm;
}

/** "1 member", "5 members". */
export function formatMemberCount(count: number): string {
  return `${count} ${plural.select(count) === "one" ? "member" : "members"}`;
}

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" });

/** For name tags on photos: "Now", "5 min", "2 h", "Yesterday", "Monday", then a date. */
export function formatShortAgo(isoDate: string, now = new Date()): string {
  const date = new Date(isoDate);
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return "Now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const daysAgo = Math.ceil((startOfToday - date.getTime()) / DAY);
  if (daysAgo <= 1) return "Yesterday";
  if (daysAgo < 7) return weekday.format(date);
  return (date.getFullYear() === now.getFullYear() ? dayMonth : dayMonthYear).format(date);
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** "0 B", "840 KB", "1.2 GB": sizes as a person reads them (1 KB is 1024 bytes). */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value)} ${BYTE_UNITS[unit]}`;
}

/** "3 days 4 h", "5 h 12 min", "42 s": how long something has been running. */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} ${nounFor(days, "day")} ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${seconds} s`;
}

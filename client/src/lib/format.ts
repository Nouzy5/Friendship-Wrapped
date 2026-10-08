const monthYear = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
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

/** The word to follow a count: nounFor(1, "photo") is "photo", nounFor(3, "photo") is "photos". */
export function nounFor(count: number, singular: string, pluralForm = `${singular}s`): string {
  return plural.select(count) === "one" ? singular : pluralForm;
}

/** "1 member", "5 members". */
export function formatMemberCount(count: number): string {
  return `${count} ${plural.select(count) === "one" ? "member" : "members"}`;
}

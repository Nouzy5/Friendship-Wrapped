const monthYear = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const plural = new Intl.PluralRules("en");

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

/** "1 member", "5 members". */
export function formatMemberCount(count: number): string {
  return `${count} ${plural.select(count) === "one" ? "member" : "members"}`;
}

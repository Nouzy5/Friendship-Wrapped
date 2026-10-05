const monthYear = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

/** e.g. "October 2026" in the viewer's locale. */
export function formatMonthYear(isoDate: string): string {
  return monthYear.format(new Date(isoDate));
}

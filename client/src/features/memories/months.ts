/** A calendar month in the viewer's time zone. `month` is 1–12. */
export type Month = { year: number; month: number };

/** "2025-08" */
export function formatMonthParam({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The month from a "YYYY-MM" URL parameter, or null if it isn't one. */
export function parseMonthParam(value: string | null): Month | null {
  const match = value?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

/** The instant the following month begins locally: the timeline lists photos from before it. */
export function endOfMonth({ year, month }: Month): string {
  return new Date(year, month, 1).toISOString();
}

export function monthOf(isoDate: string): Month {
  const date = new Date(isoDate);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** Consecutive items grouped by the local month of their date (lists are already in date order). */
export function groupByMonth<T>(items: T[], dateOf: (item: T) => string): { month: Month; items: T[] }[] {
  const groups: { month: Month; items: T[] }[] = [];
  for (const item of items) {
    const month = monthOf(dateOf(item));
    const last = groups.at(-1);
    if (last && last.month.year === month.year && last.month.month === month.month) last.items.push(item);
    else groups.push({ month, items: [item] });
  }
  return groups;
}

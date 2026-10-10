import type { ReactNode } from "react";
import { Link } from "react-router";
import { Card } from "../../../components/ui/Card";
import { AlertIcon, CheckIcon } from "../../../components/ui/icons";
import { formatNumber } from "../../../lib/format";
import type { CheckStatus, DayCount, PersonRef } from "../api";

/** One number with a caption: the building block of the overview. */
export function StatCard({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 rounded-[1.25rem] p-4">
      <p className="text-[0.8125rem] font-medium text-sub">{label}</p>
      <p className="text-[1.75rem] leading-tight font-semibold font-stretch-112% wrap-anywhere">{typeof value === "number" ? formatNumber(value) : value}</p>
      {detail && <p className="text-[0.8125rem] leading-snug text-sub">{detail}</p>}
    </Card>
  );
}

/** A titled block of the page. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold font-stretch-112%">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Label and value pairs, two columns wide on a big screen. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[0.8125rem] font-medium text-sub">{item.label}</dt>
          <dd className="text-[0.9375rem] wrap-anywhere">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const dayLabel = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

/** Bars for the last thirty days, one a day. Hover or focus a bar for its day and number. */
export function BarChart({ title, data, noun }: { title: string; data: DayCount[]; noun: string }) {
  const max = Math.max(1, ...data.map((day) => day.count));
  const total = data.reduce((sum, day) => sum + day.count, 0);
  const first = data[0];

  return (
    <Card className="rounded-[1.25rem] p-4" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-[0.8125rem] text-sub">
          {formatNumber(total)} {noun} in 30 days
        </p>
      </div>
      <ul className="mt-4 flex h-28 items-end gap-[3px]" aria-label={`${title}, per day`}>
        {data.map((day) => (
          <li
            key={day.date}
            title={`${dayLabel.format(new Date(day.date))}: ${day.count}`}
            aria-label={`${dayLabel.format(new Date(day.date))}: ${day.count} ${noun}`}
            className="flex h-full flex-1 items-end"
          >
            <span
              aria-hidden
              className={`block w-full rounded-t-[3px] ${day.count > 0 ? "bg-fg" : "bg-line"}`}
              style={{ height: day.count > 0 ? `${Math.max(6, (day.count / max) * 100)}%` : "2px" }}
            />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-between text-xs text-sub">
        <span>{first ? dayLabel.format(new Date(first.date)) : ""}</span>
        <span>Busiest day: {total === 0 ? 0 : max}</span>
        <span>Today</span>
      </div>
    </Card>
  );
}

const STATUS_LABELS: Record<CheckStatus, string> = {
  ok: "Working",
  warning: "Needs attention",
  error: "Broken",
  off: "Not set up",
};

/** A check's result: an icon and a word, never colour alone (and no red: colour means people here). */
export function StatusMark({ status }: { status: CheckStatus }) {
  const Icon = status === "ok" ? CheckIcon : status === "off" ? null : AlertIcon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-sm ${status === "error" ? "font-bold" : status === "warning" ? "font-semibold" : "text-sub"}`}>
      {Icon ? <Icon className="size-4" /> : <span aria-hidden className="inline-block h-0.5 w-3 rounded-full bg-current" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

/** A person's name as a link to their page in the admin panel. */
export function PersonLink({ person }: { person: PersonRef | { id: string; username: string; displayName?: string } }) {
  return (
    <Link to={`/admin/users/${person.id}`} className="font-semibold underline-offset-2 hover:underline">
      {person.displayName ?? `@${person.username}`}
      {person.displayName && <span className="font-normal text-sub"> @{person.username}</span>}
    </Link>
  );
}

/** A grid row for lists: stacks on a phone, lines up in columns from `md`. */
export const rowGrid = "md:grid md:items-center md:gap-4";

import { Link } from "react-router";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ChevronRightIcon } from "../../components/ui/icons";
import { Skeleton } from "../../components/ui/Skeleton";
import { BarChart, Section, StatCard, StatusMark } from "../../features/admin/components/AdminUi";
import { useOverview, useSystemReport } from "../../features/admin/hooks";
import { formatBytes, formatDateTime, formatNumber, nounFor } from "../../lib/format";
import { getFormError } from "../../lib/form-errors";
import { usePageTitle } from "../../lib/usePageTitle";

/** One line on whether everything works, linking to the full checks. */
function SystemSummary() {
  const system = useSystemReport();

  if (system.isPending) return <Skeleton className="h-20 rounded-[1.25rem]" />;
  if (system.isError) {
    return <Alert>Couldn't run the system checks: {getFormError(system.error)}</Alert>;
  }

  const problems = system.data.checks.filter((check) => check.status === "warning" || check.status === "error");
  const headline =
    system.data.status === "ok"
      ? "Everything is working"
      : system.data.status === "warning"
        ? `${problems.length} ${nounFor(problems.length, "thing needs", "things need")} attention`
        : "Something is broken";

  return (
    <Link to="/admin/system" className="block rounded-[1.25rem] bg-surface p-4 transition hover:bg-line/60">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.8125rem] font-medium text-sub">System</p>
          <p className="text-lg font-semibold font-stretch-112%">{headline}</p>
        </div>
        <StatusMark status={system.data.status} />
        <ChevronRightIcon className="size-5 shrink-0 text-sub" />
      </div>
      {problems.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-[0.9375rem] text-sub">
          {problems.slice(0, 3).map((check) => (
            <li key={check.id} className="wrap-anywhere">
              <span className="font-semibold text-fg">{check.label}:</span> {check.detail}
            </li>
          ))}
          {problems.length > 3 && <li>and {problems.length - 3} more…</li>}
        </ul>
      )}
    </Link>
  );
}

export function AdminOverviewPage() {
  usePageTitle("Admin · Overview");
  const overview = useOverview();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[2rem] leading-tight font-semibold font-stretch-112%">Overview</h1>
          {overview.data && <p className="text-sm text-sub">As of {formatDateTime(overview.data.generatedAt)}</p>}
        </div>
        <Button variant="secondary" className="min-h-11 px-4" onClick={() => void overview.refetch()} disabled={overview.isFetching}>
          {overview.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <SystemSummary />

      {overview.isPending && (
        <div role="status" aria-label="Loading" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-[1.25rem]" />
          ))}
        </div>
      )}
      {overview.isError && (
        <Alert>
          Couldn't load the numbers: {getFormError(overview.error)}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void overview.refetch()}>
            Try again
          </button>
        </Alert>
      )}

      {overview.data && (
        <>
          <Section title="People">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Accounts"
                value={overview.data.users.total}
                detail={`${formatNumber(overview.data.users.newLast7Days)} this week, ${formatNumber(overview.data.users.newLast30Days)} this month`}
              />
              <StatCard
                label="Active today"
                value={overview.data.users.active.last24Hours}
                detail={`${formatNumber(overview.data.users.active.last7Days)} this week, ${formatNumber(overview.data.users.active.last30Days)} this month`}
              />
              <StatCard
                label="Email confirmed"
                value={overview.data.users.verified}
                detail={
                  <Link to="/admin/users" className="underline-offset-2 hover:underline">
                    {formatNumber(overview.data.users.unverified)} waiting, {formatNumber(overview.data.users.withoutEmail)} with no email
                  </Link>
                }
              />
              <StatCard
                label="Groups"
                value={overview.data.groups.total}
                detail={`${formatNumber(overview.data.groups.createdLast30Days)} new this month`}
              />
            </div>
          </Section>

          <div className="grid gap-3 md:grid-cols-2">
            <BarChart title="New accounts per day" data={overview.data.daily.signups} noun="accounts" />
            <BarChart title="Posts per day" data={overview.data.daily.posts} noun="posts" />
          </div>

          <Section title="What's been shared">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Photos" value={overview.data.content.photos} />
              <StatCard label="Videos" value={overview.data.content.videos} />
              <StatCard label="Comments" value={overview.data.content.comments} />
              <StatCard label="Reactions" value={overview.data.content.reactions} />
              <StatCard label="Favorites" value={overview.data.content.favorites} />
              <StatCard label="Albums" value={overview.data.content.albums} />
              <StatCard label="Moments" value={overview.data.content.moments} />
              <StatCard label="Storage used" value={formatBytes(overview.data.content.storageBytes)} detail="Full-size photos and videos" />
            </div>
          </Section>

          <Section title="Safety and notifications">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Reports"
                value={overview.data.safety.reports}
                detail={
                  <Link to="/admin/reports" className="underline-offset-2 hover:underline">
                    {formatNumber(overview.data.safety.reportsLast7Days)} this week
                  </Link>
                }
              />
              <StatCard label="Blocks" value={overview.data.safety.blocks} />
              <StatCard
                label="Notification devices"
                value={overview.data.notifications.webPushSubscriptions + overview.data.notifications.iphoneDevices}
                detail={`${formatNumber(overview.data.notifications.webPushSubscriptions)} browsers, ${formatNumber(overview.data.notifications.iphoneDevices)} iPhones`}
              />
              <StatCard label="Notifications waiting" value={overview.data.notifications.queued} detail="Held back by quiet hours" />
            </div>
          </Section>

          <Card className="rounded-[1.25rem] p-4 text-[0.9375rem] text-sub">
            "Active" counts people who used the app in that time, to the nearest few minutes. Storage doesn't include the small thumbnail
            copies.
          </Card>
        </>
      )}
    </div>
  );
}

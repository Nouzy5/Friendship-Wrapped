import { Link } from "react-router";
import { Alert } from "../../components/ui/Alert";
import { LoadMore } from "../../components/ui/LoadMore";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { StateMessage } from "../../components/ui/StateMessage";
import type { ReportRow } from "../../features/admin/api";
import { useAdminReports } from "../../features/admin/hooks";
import { formatDateTime, formatNumber, formatRelativeTime } from "../../lib/format";
import { getFormError } from "../../lib/form-errors";
import { usePageTitle } from "../../lib/usePageTitle";

function Person({ person }: { person: { id: string; username: string; displayName?: string } }) {
  return (
    <Link to={`/admin/users/${person.id}`} className="font-semibold underline-offset-2 hover:underline">
      {person.displayName ?? `@${person.username}`}
    </Link>
  );
}

function ReportItem({ report }: { report: ReportRow }) {
  return (
    <li className="flex flex-col gap-2 rounded-[1.25rem] bg-surface p-4">
      <p className="text-[0.9375rem] whitespace-pre-wrap wrap-anywhere">{report.message}</p>
      <p className="text-sm text-sub">
        <Person person={report.reporter} /> reported
        {report.reportedUser && (
          <>
            {" "}
            <Person person={report.reportedUser} />
          </>
        )}
        {report.photo && (
          <>
            {report.reportedUser ? "'s" : ""} {report.photo.kind} in{" "}
            <Link to={`/admin/groups/${report.photo.group.id}`} className="font-semibold underline-offset-2 hover:underline">
              {report.photo.group.emoji} {report.photo.group.name}
            </Link>
            {report.photo.caption ? ` (“${report.photo.caption}”)` : ""}
            {!report.reportedUser && (
              <>
                , posted by <Person person={report.photo.uploader} />
              </>
            )}
          </>
        )}
        {!report.reportedUser && !report.photo && " the app in general"} · <span title={formatDateTime(report.createdAt)}>{formatRelativeTime(report.createdAt)}</span>
      </p>
    </li>
  );
}

export function AdminReportsPage() {
  usePageTitle("Admin · Reports");
  const reports = useAdminReports();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] leading-tight font-semibold font-stretch-112%">Reports</h1>
        <p className="text-sm text-sub">What people have reported: a photo, a person, or the app itself. Newest first.</p>
      </div>

      {reports.isPending && <ListSkeleton rows={4} card />}
      {reports.isError && !reports.data && <Alert>Couldn't load reports: {getFormError(reports.error)}</Alert>}

      {reports.data && reports.data.length === 0 && (
        <StateMessage emoji="🕊️" title="No reports" description="Nobody has reported anything. Quiet is good." />
      )}

      {reports.data && reports.data.length > 0 && (
        <div>
          <ul className="flex flex-col gap-3">
            {reports.data.map((report) => (
              <ReportItem key={report.id} report={report} />
            ))}
          </ul>
          <LoadMore
            hasMore={Boolean(reports.hasNextPage)}
            isLoading={reports.isFetchingNextPage}
            isError={reports.isFetchNextPageError}
            onLoadMore={() => void reports.fetchNextPage()}
            label="Load more reports"
            endMessage={`${formatNumber(reports.data.length)} ${reports.data.length === 1 ? "report" : "reports"}`}
          />
        </div>
      )}
    </div>
  );
}

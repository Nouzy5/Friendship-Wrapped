import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import type { SystemCheck, SystemReport } from "../../features/admin/api";
import { Facts, Section, StatusMark } from "../../features/admin/components/AdminUi";
import { useSendTestEmail, useSystemReport } from "../../features/admin/hooks";
import { formatDateTime, formatRelativeTime, formatUptime, nounFor } from "../../lib/format";
import { getFormError } from "../../lib/form-errors";
import { usePageTitle } from "../../lib/usePageTitle";

const GROUPS: SystemCheck["group"][] = ["Services", "Features", "Data"];

function CheckList({ title, checks }: { title: string; checks: SystemCheck[] }) {
  return (
    <Section title={title}>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[1.25rem] bg-surface">
        {checks.map((check) => (
          <li key={check.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold">{check.label}</span>
              <span className="text-[0.9375rem] text-sub wrap-anywhere">{check.detail}</span>
            </div>
            <StatusMark status={check.status} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function TestEmail() {
  const send = useSendTestEmail();

  return (
    <Card className="flex flex-col gap-3 rounded-[1.25rem] p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Send a test email</h2>
        <p className="text-[0.9375rem] text-sub">
          Sends a real email to your own address, to find out whether confirmation and new sign-in emails will reach people.
        </p>
      </div>
      {send.isError && <Alert>{getFormError(send.error)}</Alert>}
      {send.isSuccess && <Alert tone={send.data.delivered ? "success" : "danger"}>{`To ${send.data.to}: ${send.data.note}`}</Alert>}
      <div>
        <Button variant="secondary" onClick={() => send.mutate()} disabled={send.isPending}>
          {send.isPending ? "Sending…" : "Send test email"}
        </Button>
      </div>
    </Card>
  );
}

function ServerFacts({ server }: { server: SystemReport["server"] }) {
  return (
    <Card className="rounded-[1.25rem] p-4">
      <Facts
        items={[
          { label: "Running for", value: `${formatUptime(server.uptimeSeconds)} (since ${formatDateTime(server.startedAt)})` },
          { label: "Environment", value: server.environment },
          { label: "Node.js", value: `${server.nodeVersion} on ${server.platform}` },
          { label: "Memory", value: `${server.memoryMb.rss} MB in use, ${server.memoryMb.heapUsed} MB of it heap` },
        ]}
      />
    </Card>
  );
}

function Problems({ problems }: { problems: SystemReport["problems"] }) {
  return (
    <Section title="Recent problems">
      {problems.length === 0 ? (
        <p className="text-[0.9375rem] text-sub">The server hasn't logged a warning or an error since it started.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {problems.map((problem, index) => (
            <li key={`${problem.at}-${index}`} className="flex flex-col gap-1 rounded-2xl bg-surface px-4 py-3">
              <p className="text-[0.9375rem] wrap-anywhere">
                <span className={problem.level === "error" ? "font-bold" : "font-semibold"}>{problem.level === "error" ? "Error" : "Warning"}</span>{" "}
                {problem.message}
              </p>
              {problem.detail && <pre className="overflow-x-auto text-xs whitespace-pre-wrap wrap-anywhere text-sub">{problem.detail}</pre>}
              <p className="text-xs text-sub" title={formatDateTime(problem.at)}>
                {formatRelativeTime(problem.at)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[0.8125rem] text-sub">Kept in memory only: restarting the server clears it. The full log is wherever the server's output goes.</p>
    </Section>
  );
}

export function AdminSystemPage() {
  usePageTitle("Admin · System");
  const system = useSystemReport();
  const trouble = system.data?.checks.filter((check) => check.status === "warning" || check.status === "error") ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[2rem] leading-tight font-semibold font-stretch-112%">System</h1>
          <p className="text-sm text-sub">Checks that everything the app depends on works.</p>
        </div>
        <Button variant="secondary" className="min-h-11 px-4" onClick={() => void system.refetch()} disabled={system.isFetching}>
          {system.isFetching ? "Checking…" : "Run checks again"}
        </Button>
      </div>

      {system.isPending && (
        <div role="status" aria-label="Loading" className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-[1.25rem]" />
          ))}
        </div>
      )}
      {system.isError && !system.data && <Alert>Couldn't run the checks: {getFormError(system.error)}</Alert>}

      {system.data && (
        <>
          <Card className="flex items-center justify-between gap-4 rounded-[1.25rem] p-4">
            <div className="min-w-0">
              <p className="text-lg font-semibold font-stretch-112%">
                {system.data.status === "ok"
                  ? "Everything is working"
                  : system.data.status === "warning"
                    ? `${trouble.length} ${nounFor(trouble.length, "thing needs", "things need")} attention`
                    : "Something is broken"}
              </p>
              <p className="text-sm text-sub">Checked {formatRelativeTime(system.data.generatedAt)}</p>
            </div>
            <StatusMark status={system.data.status} />
          </Card>

          {GROUPS.map((group) => (
            <CheckList key={group} title={group} checks={system.data.checks.filter((check) => check.group === group)} />
          ))}

          <TestEmail />

          <Section title="Server">
            <ServerFacts server={system.data.server} />
          </Section>

          <Problems problems={system.data.problems} />
        </>
      )}
    </div>
  );
}

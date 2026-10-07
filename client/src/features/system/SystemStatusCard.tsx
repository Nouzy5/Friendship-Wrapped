import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ChevronRightIcon } from "../../components/ui/icons";
import { StatusIndicator } from "../../components/ui/StatusIndicator";
import { useSystemStatus, type ServiceStatus } from "./useSystemStatus";

function StatusRow({ name, service }: { name: string; service: ServiceStatus }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-ink-50">{name}</p>
        {service.detail && <p className="truncate text-xs text-ink-400">{service.detail}</p>}
      </div>
      <StatusIndicator status={service.status} />
    </li>
  );
}

/** Whether the app's server, database and photo storage are reachable: folded away unless something's wrong. */
export function SystemStatusCard() {
  const { api, database, storage, isChecking, recheck } = useSystemStatus();
  const allOk = api.status === "ok" && database.status === "ok" && storage.status === "ok";

  return (
    <Card aria-labelledby="system-status-heading" aria-busy={isChecking}>
      <details className="group" open={!isChecking && !allOk}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-lg [&::-webkit-details-marker]:hidden">
          <h2 id="system-status-heading" className="text-sm font-semibold tracking-wide text-ink-200 uppercase">
            App status
          </h2>
          <span className="flex items-center gap-1 text-xs text-ink-400">
            {isChecking ? "Checking…" : allOk ? "Everything's working" : "Something's wrong"}
            <ChevronRightIcon className="size-4 transition group-open:rotate-90" />
          </span>
        </summary>

        <ul className="mt-2 divide-y divide-ink-700/70">
          <StatusRow name="API server" service={api} />
          <StatusRow name="Database" service={database} />
          <StatusRow name="Photo storage" service={storage} />
        </ul>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p role="status" className="text-xs text-ink-400">
            {isChecking
              ? "Running checks…"
              : allOk
                ? "All systems connected."
                : "Something isn't connected right now, so some features may not work."}
          </p>
          <Button variant="ghost" className="min-h-10 shrink-0 px-3 text-xs" onClick={recheck} disabled={isChecking}>
            {isChecking ? "Checking…" : "Recheck"}
          </Button>
        </div>
      </details>
    </Card>
  );
}

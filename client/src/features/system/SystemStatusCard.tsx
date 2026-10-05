import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
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

export function SystemStatusCard() {
  const { api, database, isChecking, recheck } = useSystemStatus();
  const allOk = api.status === "ok" && database.status === "ok";

  return (
    <Card aria-labelledby="system-status-heading" aria-busy={isChecking}>
      <div className="flex items-center justify-between">
        <h2 id="system-status-heading" className="text-sm font-semibold tracking-wide text-ink-200 uppercase">
          System status
        </h2>
        <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={recheck} disabled={isChecking}>
          {isChecking ? "Checking…" : "Recheck"}
        </Button>
      </div>

      <ul className="mt-2 divide-y divide-ink-700/70">
        <StatusRow name="API server" service={api} />
        <StatusRow name="Database" service={database} />
      </ul>

      <p role="status" className="mt-3 text-xs text-ink-400">
        {isChecking
          ? "Running checks…"
          : allOk
            ? "Everything is connected. Ready for the next phase."
            : "Something isn't connected yet. See the README for setup steps."}
      </p>
    </Card>
  );
}

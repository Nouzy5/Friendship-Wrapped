import { useQuery } from "@tanstack/react-query";
import type { Status } from "../../components/ui/StatusIndicator";
import { ApiError } from "../../lib/api-client";
import { fetchHealth, type HealthReport } from "./api";

export type ServiceStatus = { status: Status; detail?: string };

export type SystemStatus = {
  api: ServiceStatus;
  database: ServiceStatus;
  isChecking: boolean;
  recheck: () => void;
};

function deriveStatus(data: HealthReport | undefined, error: Error | null, isPending: boolean) {
  if (isPending) {
    return { api: { status: "checking" }, database: { status: "checking" } } as const;
  }

  if (data) {
    return {
      api: { status: "ok", detail: `up ${formatUptime(data.uptimeSeconds)}` },
      database: { status: "ok", detail: `${data.checks.database.latencyMs} ms` },
    } as const;
  }

  // The API answered but told us the database is down.
  if (error instanceof ApiError && error.code === "DATABASE_UNAVAILABLE") {
    return { api: { status: "ok" }, database: { status: "down", detail: error.message } } as const;
  }

  return {
    api: { status: "down", detail: error?.message },
    database: { status: "unknown" },
  } as const;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function useSystemStatus(): SystemStatus {
  const query = useQuery({
    queryKey: ["system", "health"],
    queryFn: ({ signal }) => fetchHealth(signal),
    retry: false,
    staleTime: 0,
  });

  return {
    ...deriveStatus(query.data, query.error, query.isPending),
    isChecking: query.isFetching,
    recheck: () => void query.refetch(),
  };
}

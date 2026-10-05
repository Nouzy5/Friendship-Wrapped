import { useQuery } from "@tanstack/react-query";
import type { Status } from "../../components/ui/StatusIndicator";
import { ApiError } from "../../lib/api-client";
import { fetchHealth, type HealthReport } from "./api";

export type ServiceStatus = { status: Status; detail?: string };

type ServiceStatuses = { api: ServiceStatus; database: ServiceStatus; storage: ServiceStatus };

export type SystemStatus = ServiceStatuses & {
  isChecking: boolean;
  recheck: () => void;
};

function deriveStatus(data: HealthReport | undefined, error: Error | null, isPending: boolean): ServiceStatuses {
  if (isPending) {
    return { api: { status: "checking" }, database: { status: "checking" }, storage: { status: "checking" } };
  }

  if (data) {
    return {
      api: { status: "ok", detail: `up ${formatUptime(data.uptimeSeconds)}` },
      database: { status: "ok", detail: `${data.checks.database.latencyMs} ms` },
      storage: { status: "ok", detail: `${data.checks.storage.latencyMs} ms` },
    };
  }

  // The API answered but told us what's down. The database is checked first, so when
  // storage is reported down the database was fine.
  if (error instanceof ApiError && error.code === "DATABASE_UNAVAILABLE") {
    return {
      api: { status: "ok" },
      database: { status: "down", detail: error.message },
      storage: { status: "unknown" },
    };
  }
  if (error instanceof ApiError && error.code === "STORAGE_UNAVAILABLE") {
    return { api: { status: "ok" }, database: { status: "ok" }, storage: { status: "down", detail: error.message } };
  }

  return {
    api: { status: "down", detail: error?.message },
    database: { status: "unknown" },
    storage: { status: "unknown" },
  };
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

import { apiRequest } from "../../lib/api-client";

export type HealthReport = {
  status: "ok";
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: { status: "ok"; latencyMs: number };
    storage: { status: "ok"; latencyMs: number };
  };
};

export function fetchHealth(signal?: AbortSignal): Promise<HealthReport> {
  return apiRequest<HealthReport>("/health", { signal });
}

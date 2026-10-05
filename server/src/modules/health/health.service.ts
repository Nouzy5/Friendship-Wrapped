import { prisma } from "../../lib/prisma.js";
import { checkBucket } from "../../lib/storage.js";

export type ServiceCheck = { status: "ok"; latencyMs: number } | { status: "error"; latencyMs: null };

export type HealthReport = {
  status: "ok" | "error";
  uptimeSeconds: number;
  timestamp: string;
  checks: { database: ServiceCheck; storage: ServiceCheck };
};

const STORAGE_TIMEOUT_MS = 3000;

async function timed(check: () => Promise<unknown>): Promise<ServiceCheck> {
  const start = performance.now();
  try {
    await check();
    return { status: "ok", latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { status: "error", latencyMs: null };
  }
}

export function checkDatabase(): Promise<ServiceCheck> {
  return timed(() => prisma.$queryRaw`SELECT 1`);
}

export function checkStorage(): Promise<ServiceCheck> {
  return timed(() => checkBucket(AbortSignal.timeout(STORAGE_TIMEOUT_MS)));
}

export async function getHealthReport(): Promise<HealthReport> {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()]);

  return {
    status: database.status === "ok" && storage.status === "ok" ? "ok" : "error",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: { database, storage },
  };
}

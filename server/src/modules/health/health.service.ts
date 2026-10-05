import { prisma } from "../../lib/prisma.js";

export type DatabaseCheck = { status: "ok"; latencyMs: number } | { status: "error"; latencyMs: null };

export type HealthReport = {
  status: "ok" | "error";
  uptimeSeconds: number;
  timestamp: string;
  checks: { database: DatabaseCheck };
};

export async function checkDatabase(): Promise<DatabaseCheck> {
  const start = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { status: "error", latencyMs: null };
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  const database = await checkDatabase();

  return {
    status: database.status,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: { database },
  };
}

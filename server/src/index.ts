import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { checkDatabase } from "./modules/health/health.service.js";

const app = createApp();

const server = app.listen(env.API_PORT, env.API_HOST, async (error) => {
  if (error) {
    logger.error(`Failed to start API on ${env.API_HOST}:${env.API_PORT}`, error);
    process.exit(1);
  }

  logger.info(`API listening on http://${env.API_HOST}:${env.API_PORT} (${env.NODE_ENV})`);

  const database = await checkDatabase();
  if (database.status === "ok") logger.info(`Database connected (${database.latencyMs}ms)`);
  else logger.warn("Database is unreachable — check DATABASE_URL and that MySQL is running");
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);

  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

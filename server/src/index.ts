import { setTimeout as sleep } from "node:timers/promises";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { closeApns } from "./lib/apns.js";
import { logger } from "./lib/logger.js";
import { describeMail, settleMail } from "./lib/mail.js";
import { prisma } from "./lib/prisma.js";
import { sweepStaleUploads } from "./lib/upload.js";
import { sweepExpiredVerificationTokens } from "./modules/auth/email-verification.service.js";
import { checkDatabase, checkStorage } from "./modules/health/health.service.js";
import { startNotificationScheduler } from "./modules/notifications/notification-scheduler.js";
import { settleNotifications } from "./modules/notifications/notifications.service.js";

const app = createApp();

/** In development MinIO starts alongside the API, so give it a few seconds before warning. */
async function waitForStorage(attempts = 10) {
  for (let attempt = 1; ; attempt++) {
    const storage = await checkStorage();
    if (storage.status === "ok" || attempt >= attempts) return storage;
    await sleep(1000);
  }
}

const server = app.listen(env.API_PORT, env.API_HOST, async (error) => {
  if (error) {
    logger.error(`Failed to start API on ${env.API_HOST}:${env.API_PORT}`, error);
    process.exit(1);
  }

  logger.info(`API listening on http://${env.API_HOST}:${env.API_PORT} (${env.NODE_ENV})`);

  const [database, storage] = await Promise.all([checkDatabase(), waitForStorage()]);
  if (database.status === "ok") logger.info(`Database connected (${database.latencyMs}ms)`);
  else logger.warn("Database is unreachable — check DATABASE_URL and that MySQL is running");
  if (storage.status === "ok") logger.info(`Object storage connected (bucket "${env.S3_BUCKET}")`);
  else logger.warn("Object storage is unreachable — check the S3_* settings and that MinIO is running");

  if (describeMail().configured) logger.info(`Email is sent through ${describeMail().host}`);
  else if (env.NODE_ENV === "production") {
    logger.warn(
      "SMTP_HOST is not set, so no confirmation emails are sent and NOBODY can get into the app: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and MAIL_FROM, or confirm an address by hand with: npm run admin:verify-email -w server -- <email> [username]",
    );
  } else logger.info("SMTP_HOST is not set, so emails are printed here instead of being sent (open their links from this log)");
});

// Queued (quiet-hours) notifications, On This Day and Wrapped announcements.
const stopScheduler = startNotificationScheduler();

// Temporary video files a crash left behind: cleared now and then.
void sweepStaleUploads();
const uploadSweep = setInterval(() => void sweepStaleUploads(), 60 * 60 * 1000);
uploadSweep.unref();

// Confirmation links nobody opened in time.
void sweepExpiredVerificationTokens();
const tokenSweep = setInterval(() => void sweepExpiredVerificationTokens(), 60 * 60 * 1000);
tokenSweep.unref();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);

  server.close();
  stopScheduler();
  clearInterval(uploadSweep);
  clearInterval(tokenSweep);
  await settleNotifications();
  await settleMail();
  closeApns();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

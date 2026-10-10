import { adminEmails, env, isProduction } from "../../config/env.js";
import { apnsEnabled } from "../../lib/apns.js";
import { AppError } from "../../lib/errors.js";
import { videoSupported } from "../../lib/ffmpeg.js";
import { recentLoggedProblems } from "../../lib/logger.js";
import { checkMail, describeMail, sendMail } from "../../lib/mail.js";
import { pushSender } from "../../lib/push.js";
import { testMessage } from "../auth/auth-emails.js";
import { checkDatabase, checkStorage } from "../health/health.service.js";
import * as repository from "./admin.repository.js";

/** ok: working. warning: works, but something needs attention. error: broken. off: an optional feature that isn't set up. */
export type CheckStatus = "ok" | "warning" | "error" | "off";

export type SystemCheck = {
  id: string;
  group: "Services" | "Features" | "Data";
  label: string;
  status: CheckStatus;
  detail: string;
};

const SEVERITY: Record<CheckStatus, number> = { ok: 0, off: 0, warning: 1, error: 2 };

const startedAt = new Date(Date.now() - process.uptime() * 1000);
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

async function serviceChecks(): Promise<SystemCheck[]> {
  const [database, storage, mail] = await Promise.all([checkDatabase(), checkStorage(), checkMail()]);
  const checks: SystemCheck[] = [];

  if (database.status !== "ok") {
    checks.push({
      id: "database",
      group: "Services",
      label: "Database",
      status: "error",
      detail: "MySQL can't be reached. Check DATABASE_URL and that the server is running.",
    });
  } else {
    let detail = `MySQL answered in ${database.latencyMs} ms`;
    let status: CheckStatus = "ok";
    try {
      const [version, migrations] = await Promise.all([repository.databaseVersion(), repository.migrationStatus()]);
      detail = `MySQL ${version}, answered in ${database.latencyMs} ms. ${plural(migrations.applied, "migration")} applied${migrations.latest ? `, the latest is ${migrations.latest}` : ""}.`;
      if (migrations.failed.length > 0) {
        status = "error";
        detail += ` A migration failed: ${migrations.failed.join(", ")}.`;
      }
    } catch {
      status = "warning";
      detail += ", but the migration table couldn't be read.";
    }
    checks.push({ id: "database", group: "Services", label: "Database", status, detail });
  }

  checks.push(
    storage.status === "ok"
      ? {
          id: "storage",
          group: "Services",
          label: "Photo storage",
          status: "ok",
          detail: `Bucket "${env.S3_BUCKET}" answered in ${storage.latencyMs} ms`,
        }
      : {
          id: "storage",
          group: "Services",
          label: "Photo storage",
          status: "error",
          detail: `Bucket "${env.S3_BUCKET}" can't be reached. Photos can't be shown or posted. Check the S3_* settings.`,
        },
  );

  const { host, from } = describeMail();
  if (mail.status === "ok") {
    checks.push({ id: "mail", group: "Services", label: "Email", status: "ok", detail: `Connected to ${host ?? "the mail server"}. Mail is sent as ${from}.` });
  } else if (mail.status === "off") {
    checks.push({
      id: "mail",
      group: "Services",
      label: "Email",
      status: "warning",
      detail:
        "SMTP_HOST isn't set, so no email is sent. People can't confirm their address by themselves: open their account in Users and mark it verified.",
    });
  } else {
    checks.push({
      id: "mail",
      group: "Services",
      label: "Email",
      status: "error",
      detail: `The mail server refused or didn't answer: ${mail.message}`,
    });
  }
  return checks;
}

async function featureChecks(): Promise<SystemCheck[]> {
  const video = await videoSupported();
  const push = pushSender() !== null;
  const apns = apnsEnabled();

  return [
    {
      id: "push",
      group: "Features",
      label: "Web push",
      status: push ? "ok" : "off",
      detail: push ? "VAPID keys are set: browsers can get notifications." : "No VAPID keys: browsers get no notifications.",
    },
    {
      id: "apns",
      group: "Features",
      label: "iPhone push",
      status: apns ? "ok" : "off",
      detail: apns ? "The Apple push key is set: iPhones can get notifications." : "No Apple push key: the iPhone app gets no notifications.",
    },
    {
      id: "video",
      group: "Features",
      label: "Video",
      status: video ? "ok" : "off",
      detail: video ? "ffmpeg and ffprobe run: videos can be posted." : "ffmpeg or ffprobe wasn't found: videos are turned away.",
    },
    {
      id: "app-url",
      group: "Features",
      label: "Web address in emails",
      status: env.APP_URL || !isProduction ? "ok" : "warning",
      detail: env.APP_URL
        ? `Links in emails point to ${env.APP_URL}`
        : isProduction
          ? "APP_URL isn't set, so links in emails point at localhost."
          : "APP_URL isn't set: links in emails point to the dev server (http://localhost:5173).",
    },
    {
      id: "admins",
      group: "Features",
      label: "Admin access",
      status: adminEmails.size > 0 ? "ok" : "warning",
      detail: `${plural(adminEmails.size, "address", "addresses")} in ADMIN_EMAILS.`,
    },
  ];
}

async function dataChecks(now: Date): Promise<SystemCheck[]> {
  const counts = await repository.integrityCounts(now);
  const ownerProblems = counts.groupsWithoutOwner + counts.groupsWithSeveralOwners;

  return [
    {
      id: "group-owners",
      group: "Data",
      label: "Every group has exactly one owner",
      status: ownerProblems === 0 ? "ok" : "error",
      detail:
        ownerProblems === 0
          ? "All groups have one owner."
          : `${plural(counts.groupsWithoutOwner, "group")} without an owner and ${plural(counts.groupsWithSeveralOwners, "group")} with several.`,
    },
    {
      id: "empty-groups",
      group: "Data",
      label: "No empty groups",
      status: counts.groupsWithoutMembers === 0 ? "ok" : "warning",
      detail:
        counts.groupsWithoutMembers === 0
          ? "Every group has members."
          : `${plural(counts.groupsWithoutMembers, "group")} with nobody in ${counts.groupsWithoutMembers === 1 ? "it" : "them"}.`,
    },
    {
      id: "unverified",
      group: "Data",
      label: "Emails waiting to be confirmed",
      status: counts.staleUnverified === 0 ? "ok" : "warning",
      detail:
        counts.staleUnverified === 0
          ? "Nobody has waited more than a week."
          : `${plural(counts.staleUnverified, "person", "people")} signed up over a week ago and still can't get in.`,
    },
    {
      id: "no-email",
      group: "Data",
      label: "Accounts without an email",
      status: counts.withoutEmail === 0 ? "ok" : "warning",
      detail:
        counts.withoutEmail === 0
          ? "Everyone has an email address."
          : `${plural(counts.withoutEmail, "account")} from before email was required: they're asked to add one when they next open the app.`,
    },
    {
      id: "queue",
      group: "Data",
      label: "Notification queue",
      status: counts.overdueQueue === 0 ? "ok" : "warning",
      detail:
        counts.overdueQueue === 0
          ? "Nothing is overdue."
          : `${plural(counts.overdueQueue, "notification")} should have gone out over an hour ago. Is the scheduler running?`,
    },
    {
      id: "expired",
      group: "Data",
      label: "Expired sessions and links",
      status: "ok",
      detail: `${plural(counts.expiredSessions, "expired session")} and ${plural(counts.expiredLinks, "expired link")} waiting to be swept away.`,
    },
  ];
}

export async function getSystemReport(now = new Date()) {
  const [services, features, data] = await Promise.all([serviceChecks(), featureChecks(), dataChecks(now)]);
  const checks = [...services, ...features, ...data];
  const worst = checks.reduce<CheckStatus>((worse, check) => (SEVERITY[check.status] > SEVERITY[worse] ? check.status : worse), "ok");
  const memory = process.memoryUsage();

  return {
    generatedAt: now.toISOString(),
    status: worst === "off" ? ("ok" as const) : worst,
    checks,
    server: {
      environment: env.NODE_ENV,
      nodeVersion: process.version,
      platform: process.platform,
      startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: { rss: Math.round(memory.rss / 1_048_576), heapUsed: Math.round(memory.heapUsed / 1_048_576) },
    },
    problems: recentLoggedProblems(),
  };
}

/** Sends the admin a real email, to find out whether mail works. A mail server's refusal comes back as the error. */
export async function sendTestEmail(to: string): Promise<{ to: string; delivered: boolean; note: string }> {
  const { configured } = describeMail();
  try {
    await sendMail(testMessage({ to }));
  } catch (error) {
    throw new AppError(502, "EMAIL_SEND_FAILED", `The mail server didn't take it: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  return configured
    ? { to, delivered: true, note: "Handed to the mail server. Check the inbox (and the spam folder)." }
    : { to, delivered: false, note: "SMTP_HOST isn't set, so the email was only printed in the server log." };
}

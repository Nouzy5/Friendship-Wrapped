import nodemailer from "nodemailer";
import { env, isProduction } from "../config/env.js";
import { logger } from "./logger.js";

/*
 * Everything that sends email, and nothing else does. Mail goes out over SMTP (any provider: Resend,
 * Postmark, SES, Gmail, … all speak it). Without SMTP_HOST nothing is sent: in development the
 * message is printed to the server log so its link can be opened from there, and in production only
 * the fact that it wasn't sent is logged, since a link in a log file is a credential.
 */

export type MailMessage = { to: string; subject: string; text: string; html: string };

/** Delivers one message. Rejects when the mail server refuses it or can't be reached. */
export type MailTransport = {
  send: (message: MailMessage & { from: string }) => Promise<void>;
  /** Connects and signs in without sending anything; rejects if that fails. */
  verify: () => Promise<void>;
};

const FROM = env.MAIL_FROM ?? "Friendship Wrapped <no-reply@localhost>";
const VERIFY_TIMEOUT_MS = 10_000;

function createSmtpTransport(): MailTransport | null {
  if (!env.SMTP_HOST) return null;

  const secure = env.SMTP_SECURE ?? env.SMTP_PORT === 465;
  const client = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? (secure ? 465 : 587),
    secure,
    auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    // A mail server that doesn't answer mustn't hold a request (or the shutdown) for long.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return {
    send: async (message) => {
      await client.sendMail(message);
    },
    verify: async () => {
      await client.verify();
    },
  };
}

/** Null while mail is off: no SMTP_HOST configured. */
let transport: MailTransport | null = createSmtpTransport();

/** Swaps the transport: tests use a fake one (and null turns mail off again). */
export function setMailTransport(next: MailTransport | null): void {
  transport = next;
}

/** True when messages really are sent (an SMTP server is configured). */
export function mailConfigured(): boolean {
  return transport !== null;
}

/** For the admin panel: where mail goes, without the password. */
export function describeMail(): { configured: boolean; host: string | null; from: string } {
  return { configured: transport !== null, host: env.SMTP_HOST ?? null, from: FROM };
}

function logUnsent(message: MailMessage): void {
  if (isProduction) {
    logger.warn(`Email "${message.subject}" to ${message.to} was not sent: SMTP_HOST is not configured`);
  } else {
    logger.info(`Email to ${message.to} (SMTP_HOST is not set, so it is only printed here)\nSubject: ${message.subject}\n\n${message.text}`);
  }
}

/** Sends one email now. Rejects if the mail server does; with mail off it only logs. */
export async function sendMail(message: MailMessage): Promise<void> {
  if (!transport) {
    logUnsent(message);
    return;
  }
  await transport.send({ ...message, from: FROM });
}

const pending = new Set<Promise<void>>();

/**
 * Sends an email in the background, so a slow mail server never holds up the request that caused
 * it. A failure is logged and goes no further: the person can always ask for the email again.
 */
export function queueMail(message: MailMessage): void {
  const job: Promise<void> = sendMail(message)
    .catch((error: unknown) => logger.error(`Couldn't send "${message.subject}" to ${message.to}`, error))
    .finally(() => pending.delete(job));
  pending.add(job);
}

/** Waits for every queued email to be handed to the mail server (before shutting down, or in tests). */
export async function settleMail(): Promise<void> {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}

export type MailCheck =
  | { status: "ok" }
  | { status: "off" }
  | { status: "error"; message: string };

/** Whether the mail server can be reached and accepts the login (nothing is sent). */
export async function checkMail(): Promise<MailCheck> {
  if (!transport) return { status: "off" };
  try {
    await Promise.race([
      transport.verify(),
      new Promise<never>((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("The mail server did not answer in time")), VERIFY_TIMEOUT_MS);
        timer.unref();
      }),
    ]);
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unknown error" };
  }
}

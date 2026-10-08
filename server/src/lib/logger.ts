import { isTest } from "../config/env.js";

type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, message: string, meta?: unknown): void {
  if (isTest && level !== "error") return;

  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  if (meta === undefined) out(line);
  else out(line, meta);
}

export const logger = {
  info: (message: string, meta?: unknown) => write("info", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta),
};

/**
 * The request's URL for logs, with invite tokens hidden: an invite link is a credential,
 * and only its hash is stored, so it mustn't end up in log files either.
 */
export function loggableUrl(req: { originalUrl: string }): string {
  return req.originalUrl.replace(/(\/invites\/)[^/?#]+/, "$1…");
}

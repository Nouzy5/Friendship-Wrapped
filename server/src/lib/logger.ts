import { isTest } from "../config/env.js";

type LogLevel = "info" | "warn" | "error";

/** A problem the server logged, as the admin panel shows it. */
export type LoggedProblem = { at: string; level: "warn" | "error"; message: string; detail: string | null };

const MAX_RECENT_PROBLEMS = 50;
const recentProblems: LoggedProblem[] = [];

function describeMeta(meta: unknown): string | null {
  if (meta === undefined) return null;
  const text = meta instanceof Error ? `${meta.name}: ${meta.message}` : typeof meta === "string" ? meta : JSON.stringify(meta);
  // The first lines are what says what went wrong; a stack trace belongs in the log file.
  return text?.split("\n").slice(0, 6).join("\n").slice(0, 600) ?? null;
}

/** The last warnings and errors since the server started, newest first (kept in memory only). */
export function recentLoggedProblems(): LoggedProblem[] {
  return [...recentProblems].reverse();
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  if (level !== "info") {
    recentProblems.push({ at: new Date().toISOString(), level, message, detail: describeMeta(meta) });
    if (recentProblems.length > MAX_RECENT_PROBLEMS) recentProblems.shift();
  }
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

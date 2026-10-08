import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../config/env.js";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";

function createPrismaClient(): PrismaClient {
  const url = new URL(env.DATABASE_URL);

  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: 10,
    // MySQL 8's default auth (caching_sha2_password) needs the server's RSA key
    // on non-TLS connections. Only allow fetching it for local development hosts.
    allowPublicKeyRetrieval: ["127.0.0.1", "localhost", "::1"].includes(url.hostname),
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = createPrismaClient();

/** Either the root client or the client inside a transaction. Repositories accept both. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

/** True when a write failed because it would violate a unique index. */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * True when a row a request was working on disappeared between checking it and writing:
 * an update or delete found nothing (P2025), or a new row points at one just deleted
 * (P2003), such as a comment on a photo deleted a moment earlier.
 */
export function isVanishedRecordError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2025" || error.code === "P2003");
}

const MAX_TRANSACTION_ATTEMPTS = 3;

/**
 * Runs `fn` in a SERIALIZABLE transaction, for multi-step changes that must keep an
 * invariant (e.g. "every group has exactly one owner") under concurrent requests.
 * Retries when MySQL aborts it for a write conflict or deadlock.
 */
export async function withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        // Prisma's defaults (2 s to start, 5 s to finish) are too short for the big ones: the
        // last member leaving deletes the whole group, and deleting an account can do that
        // for several groups. Failing would make leaving impossible, so allow a minute.
        maxWait: 10_000,
        timeout: 60_000,
      });
    } catch (error) {
      const isConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!isConflict || attempt >= MAX_TRANSACTION_ATTEMPTS) throw error;
    }
  }
}

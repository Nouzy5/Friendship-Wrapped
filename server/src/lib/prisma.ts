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
      });
    } catch (error) {
      const isConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!isConflict || attempt >= MAX_TRANSACTION_ATTEMPTS) throw error;
    }
  }
}

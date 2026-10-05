import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

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

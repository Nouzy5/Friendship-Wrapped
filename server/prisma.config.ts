import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// The Prisma CLI does not load .env files on its own.
const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

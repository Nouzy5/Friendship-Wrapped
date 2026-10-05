import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Resolve .env files relative to the server package so scripts work from any cwd.
const envFileName = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
const envFilePath = fileURLToPath(new URL(`../../${envFileName}`, import.meta.url));
if (existsSync(envFilePath)) process.loadEnvFile(envFilePath);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Namespaced so a generic PORT/HOST exported by other tooling (e.g. a dev
  // server runner for the client) can't hijack the API's address.
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z
    .string()
    .startsWith("mysql://", { message: "DATABASE_URL must be a mysql:// connection string" }),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

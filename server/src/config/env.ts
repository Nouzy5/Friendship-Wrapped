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

  // Object storage, spoken to over the S3 API: MinIO locally, any S3-compatible
  // service (AWS S3, Cloudflare R2, …) in production. Omit S3_ENDPOINT for AWS.
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(3).max(63),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** MinIO needs path-style URLs (http://host/bucket/key); most hosted services don't. */
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

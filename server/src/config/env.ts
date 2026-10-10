import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Resolve .env files relative to the server package so scripts work from any cwd.
const envFileName = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
const envFilePath = fileURLToPath(new URL(`../../${envFileName}`, import.meta.url));
if (existsSync(envFilePath)) process.loadEnvFile(envFilePath);

/** An optional setting, where an empty value (`KEY=`) counts as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

/**
 * How many reverse proxies sit in front of the API: a count, or `false` for none. Never `true`:
 * that would believe every X-Forwarded-For entry, and anyone can write those.
 */
const proxyCount = z
  .string()
  .trim()
  .regex(/^(false|\d{1,2})$/i, {
    message:
      'TRUST_PROXY must be the number of reverse proxies in front of the API (e.g. 1), or false. "true" is not accepted: it would trust a forged X-Forwarded-For',
  })
  .transform((value) => (value.toLowerCase() === "false" ? 0 : Number(value)));

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

  // Web Push (VAPID). Optional: without all three, push notifications are simply off.
  VAPID_PUBLIC_KEY: optional(z.string().regex(/^[A-Za-z0-9_-]+$/, "VAPID_PUBLIC_KEY must be base64url")),
  VAPID_PRIVATE_KEY: optional(z.string().regex(/^[A-Za-z0-9_-]+$/, "VAPID_PRIVATE_KEY must be base64url")),
  /** A contact for push services: a mailto: or https: URL. */
  VAPID_SUBJECT: optional(z.string().regex(/^(mailto:|https:\/\/)\S+$/, "VAPID_SUBJECT must be a mailto: or https: URL")),

  // Apple Push Notifications for the iPhone app. Optional: without a key, ID and team, the iPhone
  // app gets no notifications. The key is the .p8 file from Apple Developer → Keys (the
  // contents, with line breaks as \n if the host wants one line), or a path to the file.
  APNS_KEY: optional(z.string().min(1)),
  APNS_KEY_PATH: optional(z.string().min(1)),
  /** The 10-character ID of that key. */
  APNS_KEY_ID: optional(z.string().regex(/^[A-Z0-9]{10}$/, "APNS_KEY_ID must be the key's 10-character ID")),
  /** The 10-character Apple Developer Team ID. */
  APNS_TEAM_ID: optional(z.string().regex(/^[A-Z0-9]{10}$/, "APNS_TEAM_ID must be the 10-character Team ID")),
  /** The app's bundle identifier, which Apple calls the notification's topic. Defaults to this app's. */
  APNS_TOPIC: optional(z.string().min(1)),

  // Video. Posting a video needs ffmpeg and ffprobe: on the PATH, or at these paths. Without them
  // the server runs as before and refuses videos (503 VIDEO_UNAVAILABLE).
  FFMPEG_PATH: optional(z.string().min(1)),
  FFPROBE_PATH: optional(z.string().min(1)),

  // Email: the verification link and the "new sign-in" notice. Optional: without SMTP_HOST nothing is
  // sent. In development the email is printed to the server log instead, so the link can be
  // opened from there; in production nothing is printed (a link in a log is a credential) and
  // the admin panel can mark an address verified by hand.
  SMTP_HOST: optional(z.string().min(1)),
  SMTP_PORT: optional(z.coerce.number().int().min(1).max(65_535)),
  /** True for implicit TLS (usually port 465). Otherwise the connection upgrades with STARTTLS when the server offers it. */
  SMTP_SECURE: optional(z.stringbool()),
  SMTP_USER: optional(z.string().min(1)),
  SMTP_PASSWORD: optional(z.string().min(1)),
  /** The sender, e.g. `Friendship Wrapped <no-reply@example.com>`. Required with SMTP_HOST. */
  MAIL_FROM: optional(z.string().min(3).max(200)),
  /** The web app's public address, for the links in emails (no trailing slash needed). Required with SMTP_HOST in production. */
  APP_URL: optional(z.url({ protocol: /^https?$/ })),

  /** Accounts one address may create per hour (default 30). Every sign-up sends an email, so this keeps it from being used to flood inboxes. Raise it for a big group signing up from one address (one Wi-Fi network). */
  SIGNUP_LIMIT_PER_HOUR: optional(z.coerce.number().int().min(1)),

  /** How many reverse proxies (nginx, Caddy, a platform's load balancer, …) the API sits behind. Unset or `false`: none, and X-Forwarded-For is ignored. Set it exactly: too low and every visitor shares the proxy's address (so the per-address limits above become global); too high and a visitor can fake theirs. */
  TRUST_PROXY: optional(proxyCount),

  // The admin panel is for whoever runs the server: a comma-separated list of email addresses.
  // Only an account whose email is verified, and listed here, gets in.
  ADMIN_EMAILS: optional(
    z
      .string()
      .transform((list) => list.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean))
      .pipe(z.array(z.email({ message: "ADMIN_EMAILS must be a comma-separated list of email addresses" }))),
  ),
}).superRefine((settings, context) => {
  if (!settings.SMTP_HOST) return;
  if (!settings.MAIL_FROM) {
    context.addIssue({ code: "custom", path: ["MAIL_FROM"], message: "MAIL_FROM is required when SMTP_HOST is set" });
  }
  if (settings.NODE_ENV === "production" && !settings.APP_URL) {
    context.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL is required in production when SMTP_HOST is set" });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

/** The web app's address, for links in emails (the dev server's, unless APP_URL says otherwise). */
export const appUrl = (env.APP_URL ?? "http://localhost:5173").replace(/\/+$/, "");

/** How many reverse proxies are in front of the API (0: none, the default). */
export const trustProxyCount = env.TRUST_PROXY ?? 0;

/** The addresses allowed into the admin panel (lowercase). Empty: nobody is. */
export const adminEmails: ReadonlySet<string> = new Set(env.ADMIN_EMAILS ?? []);

/**
 * Runs MinIO as the local object storage for development and tests. Production points
 * the S3_* settings at a real bucket instead, and none of this runs.
 */
import { CreateBucketCommand, HeadBucketCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export type LocalStorageSettings = {
  endpoint: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

/** Bucket data lives in the repo's gitignored .local folder. */
const DATA_DIR = fileURLToPath(new URL("../../.local/minio", import.meta.url));
const CONSOLE_PORT = 9001;
const STARTUP_TIMEOUT_MS = 30_000;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The local storage settings from an env file's values, or null if S3_ENDPOINT isn't a local address. */
export function localStorageSettings(env: Record<string, string | undefined>): LocalStorageSettings | null {
  const { S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET } = env;
  if (!S3_ENDPOINT) return null;

  const endpoint = new URL(S3_ENDPOINT);
  if (!LOCAL_HOSTS.has(endpoint.hostname)) return null;

  if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET) {
    throw new Error("S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_BUCKET are required");
  }
  return {
    endpoint,
    region: S3_REGION ?? "us-east-1",
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    bucket: S3_BUCKET,
  };
}

async function isLive(endpoint: URL): Promise<boolean> {
  try {
    const res = await fetch(new URL("/minio/health/live", endpoint), { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitUntilLive(endpoint: URL, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`MinIO exited during startup (code ${child.exitCode})`);
    if (await isLive(endpoint)) return;
    await sleep(250);
  }
  throw new Error(`MinIO didn't start within ${STARTUP_TIMEOUT_MS / 1000}s`);
}

/**
 * Starts MinIO with the S3 credentials as its root login, unless one is already
 * listening. Returns the process it started, or null if it reused a running one.
 */
export async function startLocalStorage(
  settings: LocalStorageSettings,
  stdio: "inherit" | "ignore",
): Promise<ChildProcess | null> {
  if (await isLive(settings.endpoint)) return null;

  mkdirSync(DATA_DIR, { recursive: true });
  const child = spawn(
    process.env.MINIO_BIN ?? "minio",
    [
      "server",
      DATA_DIR,
      "--address",
      settings.endpoint.host,
      "--console-address",
      `${settings.endpoint.hostname}:${CONSOLE_PORT}`,
      "--quiet", // its startup banner would print the root password
    ],
    {
      env: {
        ...process.env,
        MINIO_ROOT_USER: settings.accessKeyId,
        MINIO_ROOT_PASSWORD: settings.secretAccessKey,
        MINIO_UPDATE: "off",
      },
      stdio,
      windowsHide: true,
    },
  );

  const failedToSpawn = new Promise<never>((_resolve, reject) => {
    child.once("error", (error: NodeJS.ErrnoException) => {
      reject(
        error.code === "ENOENT"
          ? new Error("MinIO isn't installed or not on PATH (see README → Object storage), or set MINIO_BIN")
          : error,
      );
    });
  });

  try {
    await Promise.race([waitUntilLive(settings.endpoint, child), failedToSpawn]);
  } catch (error) {
    child.kill();
    throw error;
  }
  return child;
}

/** Creates the bucket if it doesn't exist yet. */
export async function ensureBucket(settings: LocalStorageSettings): Promise<void> {
  const client = new S3Client({
    endpoint: settings.endpoint.origin,
    region: settings.region,
    forcePathStyle: true,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  });

  try {
    await client.send(new HeadBucketCommand({ Bucket: settings.bucket }));
  } catch (error) {
    if (!(error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)) throw error;
    await client.send(new CreateBucketCommand({ Bucket: settings.bucket }));
  } finally {
    client.destroy();
  }
}

export const consoleUrl = (settings: LocalStorageSettings) =>
  `http://${settings.endpoint.hostname}:${CONSOLE_PORT}`;

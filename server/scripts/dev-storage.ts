/**
 * `npm run storage` (part of `npm run dev`): starts local MinIO and creates the dev
 * bucket, then stays attached to MinIO until it exits.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { consoleUrl, ensureBucket, localStorageSettings, startLocalStorage } from "./local-storage.js";

const envFile = new URL("../.env", import.meta.url);
const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const settings = localStorageSettings({ ...env, ...process.env });

if (!settings) {
  console.log("S3_ENDPOINT isn't a local address, so there's no local storage to start.");
  process.exit(0);
}

const minio = await startLocalStorage(settings, "inherit");
await ensureBucket(settings);

console.log(
  `MinIO ready at ${settings.endpoint.origin} (bucket "${settings.bucket}"). Browse it at ${consoleUrl(settings)}.`,
);

if (minio) {
  minio.on("exit", (code) => process.exit(code ?? 0));
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => minio.kill());
} else {
  console.log("MinIO was already running, so it was left as is.");
}

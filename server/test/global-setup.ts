import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { ensureBucket, localStorageSettings, startLocalStorage } from "../scripts/local-storage.js";

/**
 * Brings the test database schema up to date and makes sure the test bucket exists,
 * starting MinIO for the duration of the run if it isn't already running.
 */
export default async function setup(): Promise<() => void> {
  const serverRoot = fileURLToPath(new URL("..", import.meta.url));

  try {
    execSync("npx prisma migrate deploy", {
      cwd: serverRoot,
      env: { ...process.env, NODE_ENV: "test" },
      stdio: "pipe",
    });
  } catch (error) {
    const output = (error as { stdout?: Buffer; stderr?: Buffer }).stderr?.toString() ?? "";
    throw new Error(`Failed to migrate the test database:\n${output}`);
  }

  const testEnv = parseEnv(readFileSync(new URL("../.env.test", import.meta.url), "utf8"));
  const storage = localStorageSettings({ ...testEnv, ...process.env });
  const minio = storage ? await startLocalStorage(storage, "ignore") : null;
  if (storage) await ensureBucket(storage);

  return () => {
    minio?.kill();
  };
}

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Brings the test database schema up to date before any test file runs. */
export default function setup(): void {
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
}

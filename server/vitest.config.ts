import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The admin panel is for one address; tests sign it up as "admin".
    // Every test signs people up from the same address, so the sign-up limit is out of the way.
    env: { NODE_ENV: "test", ADMIN_EMAILS: "admin@example.com", SIGNUP_LIMIT_PER_HOUR: "100000" },
    globalSetup: ["test/global-setup.ts"],
    // Test files share one real database, so run them one at a time.
    fileParallelism: false,
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The admin panel is for one address; tests sign it up as "admin".
    // Every test signs people up from the same address, so the sign-up limit is out of the way.
    // No proxy in front, whatever the shell says (test/trust-proxy.test.ts covers the setting).
    env: { NODE_ENV: "test", ADMIN_EMAILS: "admin@example.com", SIGNUP_LIMIT_PER_HOUR: "100000", TRUST_PROXY: "" },
    globalSetup: ["test/global-setup.ts"],
    // Test files share one real database, so run them one at a time.
    fileParallelism: false,
  },
});

import { defineConfig } from "vitest/config";

// Only plain logic is tested here (what a share card shows, formatting): nothing needs a browser.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

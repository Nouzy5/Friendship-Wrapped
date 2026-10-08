import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// The client always calls the API on its own origin (/api), so auth cookies
// stay first-party. In development Vite forwards those calls to Express.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Shown in Settings → Help & about.
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: apiTarget } },
  },
  preview: {
    port: 4173,
    proxy: { "/api": { target: apiTarget } },
  },
});

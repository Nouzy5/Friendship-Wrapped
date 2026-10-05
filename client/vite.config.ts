import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The client always calls the API on its own origin (/api), so auth cookies
// stay first-party. In development Vite forwards those calls to Express.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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

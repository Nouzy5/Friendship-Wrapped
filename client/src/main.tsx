import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import "./index.css";
import { registerServiceWorker } from "./features/notifications/push";
import { subscribeToDeviceSettings } from "./lib/device-settings";
import { queryClient } from "./lib/query-client";
import { startAppearance } from "./lib/theme";
import { router } from "./router";

startAppearance(subscribeToDeviceSettings);
registerServiceWorker();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

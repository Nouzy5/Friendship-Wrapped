import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { getPushKey, subscribe, unsubscribe } from "./notifications.controller.js";

/** Web Push. Which notifications someone gets is in their settings (users/me/settings). */
export const notificationsRouter = Router();

// The public key isn't a secret.
notificationsRouter.get("/push-key", getPushKey);

notificationsRouter.use(requireAuth);

notificationsRouter.post("/subscriptions", subscribe);
notificationsRouter.delete("/subscriptions", unsubscribe);

import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { getPushKey, registerDevice, removeDevice, subscribe, unsubscribe } from "./notifications.controller.js";

/**
 * Web Push (browsers) and Apple push (the iPhone app). Which notifications someone gets is in
 * their settings (users/me/settings).
 */
export const notificationsRouter = Router();

// The public key isn't a secret.
notificationsRouter.get("/push-key", getPushKey);

notificationsRouter.use(requireAuth);

notificationsRouter.post("/subscriptions", subscribe);
notificationsRouter.delete("/subscriptions", unsubscribe);
notificationsRouter.post("/devices", registerDevice);
notificationsRouter.delete("/devices", removeDevice);

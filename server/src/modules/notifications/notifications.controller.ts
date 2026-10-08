import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { subscriptionSchema, unsubscribeSchema } from "./notifications.schemas.js";
import * as notificationsService from "./notifications.service.js";

/** GET /notifications/push-key — the VAPID public key to subscribe with; null while push is off. */
export const getPushKey: RequestHandler = (_req, res) => {
  res.json({ publicKey: notificationsService.getPushKey() });
};

/** POST /notifications/subscriptions — `{ endpoint, keys: { p256dh, auth } }` */
export const subscribe: RequestHandler = async (req, res) => {
  const input = subscriptionSchema.parse(req.body);
  await notificationsService.subscribe(currentUser(req).id, input);
  res.status(201).end();
};

/** DELETE /notifications/subscriptions — `{ endpoint }` */
export const unsubscribe: RequestHandler = async (req, res) => {
  const { endpoint } = unsubscribeSchema.parse(req.body);
  await notificationsService.unsubscribe(currentUser(req).id, endpoint);
  res.status(204).end();
};

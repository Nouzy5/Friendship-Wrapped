import type { RequestHandler } from "express";
import { currentSessionId, currentUser } from "../auth/auth.middleware.js";
import { deviceSchema, removeDeviceSchema, subscriptionSchema, unsubscribeSchema } from "./notifications.schemas.js";
import * as notificationsService from "./notifications.service.js";

/**
 * GET /notifications/push-key — the VAPID public key to subscribe a browser with (null while
 * web push is off), and whether iPhones can be notified (`apns`).
 */
export const getPushKey: RequestHandler = (_req, res) => {
  res.json(notificationsService.getPushStatus());
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

/** POST /notifications/devices — `{ token, environment: "sandbox" | "production" }`: the iPhone app's Apple push token. */
export const registerDevice: RequestHandler = async (req, res) => {
  const input = deviceSchema.parse(req.body);
  await notificationsService.registerDevice(currentUser(req).id, currentSessionId(req), input);
  res.status(201).end();
};

/** DELETE /notifications/devices — `{ token }` */
export const removeDevice: RequestHandler = async (req, res) => {
  const { token } = removeDeviceSchema.parse(req.body);
  await notificationsService.removeDevice(currentUser(req).id, token);
  res.status(204).end();
};

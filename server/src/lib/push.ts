import webpush from "web-push";
import { env } from "../config/env.js";

/** What a notification shows. The client's service worker turns it into a system notification. */
export type PushPayload = {
  title: string;
  body: string;
  /** The app page to open when the notification is tapped, e.g. "/photos/<id>". */
  url: string;
  /** Notifications with the same tag replace each other on the device. */
  tag: string;
};

/** One browser's push subscription, as the Push API hands it to the client. */
export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };

/**
 * Delivers one push message. Rejects when the push service refuses it, with the HTTP
 * status as `statusCode` (404 or 410: the subscription is gone for good).
 */
export type PushSender = (target: PushTarget, payload: PushPayload) => Promise<void>;

const vapid =
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
    ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
    : null;

/** A day: a notification nobody could receive by then isn't worth showing. */
const TTL_SECONDS = 24 * 60 * 60;

const webPushSender: PushSender = async (target, payload) => {
  await webpush.sendNotification(target, JSON.stringify(payload), {
    vapidDetails: vapid!,
    TTL: TTL_SECONDS,
    timeout: 10_000,
  });
};

/** Null while push is off: no VAPID key pair configured. */
let sender: PushSender | null = vapid ? webPushSender : null;

/** The application server key browsers subscribe with; null while push is off. */
export const vapidPublicKey: string | null = vapid?.publicKey ?? null;

export function pushSender(): PushSender | null {
  return sender;
}

/** Swaps the sender: tests use a fake one (and null turns push off again). */
export function setPushSender(next: PushSender | null): void {
  sender = next;
}

/** True when the push service says the subscription no longer exists (unsubscribed or expired). */
export function isSubscriptionGone(error: unknown): boolean {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return status === 404 || status === 410;
}

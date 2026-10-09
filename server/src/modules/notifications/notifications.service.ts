import type { ReactionType } from "../../generated/prisma/client.js";
import { apnsEnabled, apnsSender, isDeviceGone } from "../../lib/apns.js";
import { logger } from "../../lib/logger.js";
import { isSubscriptionGone, pushSender, vapidPublicKey, type PushPayload } from "../../lib/push.js";
import * as blocksRepository from "../blocks/blocks.repository.js";
import * as commentsRepository from "../comments/comments.repository.js";
import { toUserSettings, wantsNotification, type NotificationKind, type UserSettings } from "../settings/settings.dto.js";
import * as notificationsRepository from "./notifications.repository.js";
import type { RecipientRow } from "./notifications.repository.js";
import { quietHoursEnd } from "./quiet-hours.js";
import type { DeviceInput, SubscriptionInput } from "./notifications.schemas.js";

export function getPushKey(): string | null {
  return vapidPublicKey;
}

/** What the clients ask before offering notifications: which kinds of device this server can reach. */
export function getPushStatus(): { publicKey: string | null; apns: boolean } {
  return { publicKey: vapidPublicKey, apns: apnsEnabled() };
}

/** Subscribing the same browser again (same endpoint) updates it. */
export async function subscribe(userId: string, { endpoint, keys }: SubscriptionInput): Promise<void> {
  await notificationsRepository.upsertSubscription(userId, { endpoint, ...keys });
}

/** Unsubscribing a browser that isn't subscribed is a no-op. */
export async function unsubscribe(userId: string, endpoint: string): Promise<void> {
  await notificationsRepository.deleteSubscription(userId, endpoint);
}

/**
 * Registers the iPhone for the session it asks with. Registering again (the app does, every
 * launch, since Apple may change the token) updates it; signing in as someone else on the
 * same phone moves it to them.
 */
export async function registerDevice(userId: string, sessionId: string, { token, environment }: DeviceInput): Promise<void> {
  await notificationsRepository.upsertDevice(userId, sessionId, {
    token,
    environment: environment === "sandbox" ? "SANDBOX" : "PRODUCTION",
  });
}

/** Removing an iPhone that isn't registered (or isn't yours) is a no-op. */
export async function removeDevice(userId: string, token: string): Promise<void> {
  await notificationsRepository.deleteDevice(userId, token);
}

// ---------------------------------------------------------------------------------------
// Delivery

export type Recipient = {
  userId: string;
  settings: UserSettings;
  subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[];
  devices: { id: string; token: string; environment: "SANDBOX" | "PRODUCTION" }[];
};

export function toRecipient(row: RecipientRow, now = new Date()): Recipient {
  return {
    userId: row.id,
    settings: toUserSettings(row.settings),
    subscriptions: row.pushSubscriptions,
    // A phone whose session has run out is signed out, whether or not the row has been swept up yet.
    devices: row.apnsDevices
      .filter((device) => device.session.expiresAt.getTime() > now.getTime())
      .map(({ id, token, environment }) => ({ id, token, environment })),
  };
}

/**
 * Sends to every browser the person subscribed and every iPhone signed in as them, dropping
 * the ones the push services say are gone.
 */
async function sendNow(recipient: Recipient, payload: PushPayload): Promise<void> {
  const sendWeb = pushSender();
  const sendApns = apnsSender();

  await Promise.all([
    ...(sendWeb
      ? recipient.subscriptions.map(async ({ id, endpoint, p256dh, auth }) => {
          try {
            await sendWeb({ endpoint, keys: { p256dh, auth } }, payload);
          } catch (error) {
            if (isSubscriptionGone(error)) await notificationsRepository.deleteSubscriptionById(id);
            else logger.warn(`Push notification to ${new URL(endpoint).host} failed`, error);
          }
        })
      : []),
    ...(sendApns
      ? recipient.devices.map(async ({ id, token, environment }) => {
          try {
            await sendApns({ token, environment }, payload);
          } catch (error) {
            if (isDeviceGone(error)) await notificationsRepository.deleteDeviceById(id);
            else logger.warn("Push notification to an iPhone failed", error);
          }
        })
      : []),
  ]);
}

/** Sends now, or (during the person's quiet hours) queues it for when they end. */
export async function deliver(recipient: Recipient, payload: PushPayload, now = new Date()): Promise<void> {
  const until = quietHoursEnd(recipient.settings, now);
  if (until) await notificationsRepository.queueNotification(recipient.userId, payload, until);
  else await sendNow(recipient, payload);
}

/** Sends queued notifications whose quiet hours are over (run by the scheduler). */
export async function deliverQueued(now: Date): Promise<void> {
  for (;;) {
    const due = await notificationsRepository.listDueNotifications(now, 100);
    for (const { id, user, ...payload } of due) {
      if (!(await notificationsRepository.claimQueuedNotification(id))) continue;
      const recipient = toRecipient(user, now);
      // They may have switched notifications off since.
      if (recipient.settings.notifications.enabled) await sendNow(recipient, payload);
    }
    if (due.length < 100) return;
  }
}

// ---------------------------------------------------------------------------------------
// Events. Each runs in the background: the request that caused it doesn't wait for push services.

const pending = new Set<Promise<void>>();

function inBackground(job: () => Promise<void>): void {
  if (!pushSender() && !apnsSender()) return; // push is off
  const promise: Promise<void> = job()
    .catch((error: unknown) => logger.error("Failed to send push notifications", error))
    .finally(() => pending.delete(promise));
  pending.add(promise);
}

/** Resolves once every notification started so far has been sent or queued (for tests and shutdown). */
export async function settleNotifications(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}

type GroupEvent = {
  kind: NotificationKind;
  groupId: string;
  actorId: string;
  /** Who to tell, or null for every member. */
  to: string[] | null;
  /** For events about a photo: people with a block between them and its uploader can't see it. */
  uploaderId?: string;
  payload: (context: { group: { id: string; name: string; emoji: string }; actor: { displayName: string } }) => PushPayload;
};

/**
 * Notifies members of the group, never the person who did it, never across a block, never
 * someone who muted the group or switched this kind of notification off.
 */
function notifyGroup({ kind, groupId, actorId, to, uploaderId, payload }: GroupEvent): void {
  inBackground(async () => {
    const context = await notificationsRepository.findEventContext(groupId, actorId);
    if (!context) return;
    const [rows, blocked] = await Promise.all([
      notificationsRepository.findGroupRecipients(groupId, to),
      blocksRepository.findBlockedWith(uploaderId ? [actorId, uploaderId] : [actorId]),
    ]);
    const message = payload(context);
    const now = new Date();
    await Promise.all(
      rows
        .filter((row) => row.id !== actorId && !blocked.has(row.id))
        .map((row) => toRecipient(row, now))
        .filter((recipient) => wantsNotification(recipient.settings, kind))
        .map((recipient) => deliver(recipient, message, now)),
    );
  });
}

const groupTitle = (group: { name: string; emoji: string }) => `${group.emoji} ${group.name}`;

const REACTION_EMOJI: Record<ReactionType, string> = { HEART: "❤️", LAUGH: "😂", SKULL: "💀", FIRE: "🔥", CRY: "😭" };

/** The first 80 characters of a comment, on one line. */
function snippet(text: string, length = 80): string {
  const characters = [...text.replace(/\s+/g, " ").trim()];
  return characters.length > length ? `${characters.slice(0, length).join("").trimEnd()}…` : characters.join("");
}

type PhotoRef = { id: string; groupId: string; uploaderId: string };

/** "Tomáš posted a photo" (or "a video"), to the rest of the group. */
export function photoPosted(photoId: string, groupId: string, uploaderId: string, kind: "photo" | "video" = "photo"): void {
  notifyGroup({
    kind: "photos",
    groupId,
    actorId: uploaderId,
    to: null,
    uploaderId,
    payload: ({ group, actor }) => ({
      title: groupTitle(group),
      body: `${actor.displayName} posted a ${kind}`,
      url: `/photos/${photoId}`,
      tag: `photos:${groupId}`,
    }),
  });
}

/** "Marek reacted 😂 to your photo", to the uploader. */
export function reacted(photo: PhotoRef, actorId: string, type: ReactionType): void {
  notifyGroup({
    kind: "reactions",
    groupId: photo.groupId,
    actorId,
    to: [photo.uploaderId],
    payload: ({ group, actor }) => ({
      title: groupTitle(group),
      body: `${actor.displayName} reacted ${REACTION_EMOJI[type]} to your photo`,
      url: `/photos/${photo.id}`,
      tag: `reactions:${photo.id}`,
    }),
  });
}

/** `Adam commented: "…"`, to the uploader and everyone who commented before. */
export function commented(photo: PhotoRef, actorId: string, body: string): void {
  inBackground(async () => {
    const commenters = await commentsRepository.listCommenterIds(photo.id);
    notifyGroup({
      kind: "comments",
      groupId: photo.groupId,
      actorId,
      to: [photo.uploaderId, ...commenters],
      uploaderId: photo.uploaderId,
      payload: ({ group, actor }) => ({
        title: groupTitle(group),
        body: `${actor.displayName} commented: "${snippet(body)}"`,
        url: `/photos/${photo.id}`,
        tag: `comments:${photo.id}`,
      }),
    });
  });
}

/** "Tomáš started a moment: 🌙 Friday at the lake", to the rest of the group. */
export function momentStarted(momentId: string, groupId: string, creatorId: string, moment: { title: string; emoji: string | null }): void {
  notifyGroup({
    kind: "moments",
    groupId,
    actorId: creatorId,
    to: null,
    payload: ({ group, actor }) => ({
      title: groupTitle(group),
      body: `${actor.displayName} started a moment: ${moment.emoji ? `${moment.emoji} ` : ""}${moment.title}`,
      url: `/memories/moments/${momentId}`,
      tag: `moments:${groupId}`,
    }),
  });
}

/** "Peter joined The Boys", to the rest of the group. */
export function memberJoined(groupId: string, userId: string): void {
  notifyGroup({
    kind: "members",
    groupId,
    actorId: userId,
    to: null,
    payload: ({ group, actor }) => ({
      title: groupTitle(group),
      body: `${actor.displayName} joined ${group.name}`,
      url: `/groups/${groupId}`,
      tag: `members:${groupId}`,
    }),
  });
}

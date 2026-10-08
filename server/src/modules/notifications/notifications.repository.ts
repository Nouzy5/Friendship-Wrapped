import type { Prisma } from "../../generated/prisma/client.js";
import type { PushPayload } from "../../lib/push.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { settingsSelect } from "../settings/settings.dto.js";

const subscriptionSelect = { id: true, endpoint: true, p256dh: true, auth: true } satisfies Prisma.PushSubscriptionSelect;

/** Everything needed to decide whether, when and where to notify someone. */
export const recipientSelect = {
  id: true,
  settings: { select: settingsSelect },
  pushSubscriptions: { select: subscriptionSelect },
} satisfies Prisma.UserSelect;

export type RecipientRow = Prisma.UserGetPayload<{ select: typeof recipientSelect }>;

/** Adds the browser's subscription, or moves it to this user (one browser, another account). */
export function upsertSubscription(
  userId: string,
  { endpoint, p256dh, auth }: { endpoint: string; p256dh: string; auth: string },
  db: DbClient = prisma,
) {
  return db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh, auth },
    update: { userId, p256dh, auth },
    select: { id: true },
  });
}

export function deleteSubscription(userId: string, endpoint: string, db: DbClient = prisma) {
  return db.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/** For subscriptions the push service says are gone. */
export function deleteSubscriptionById(id: string, db: DbClient = prisma) {
  return db.pushSubscription.deleteMany({ where: { id } });
}

/**
 * Members of the group who could be notified (they have a push subscription and haven't
 * muted it), out of `userIds`, or out of everyone in the group when it's null.
 */
export async function findGroupRecipients(groupId: string, userIds: string[] | null, db: DbClient = prisma) {
  const rows = await db.groupMember.findMany({
    where: {
      groupId,
      muted: false,
      ...(userIds && { userId: { in: userIds } }),
      user: { pushSubscriptions: { some: {} } },
    },
    select: { user: { select: recipientSelect } },
  });
  return rows.map((row) => row.user);
}

/** The group's name and emoji, and who did something, for a notification's words. */
export async function findEventContext(groupId: string, actorId: string, db: DbClient = prisma) {
  const [group, actor] = await Promise.all([
    db.group.findUnique({ where: { id: groupId }, select: { id: true, name: true, emoji: true } }),
    db.user.findUnique({ where: { id: actorId }, select: { displayName: true } }),
  ]);
  return group && actor ? { group, actor } : null;
}

/** Holds a notification until `deliverAt`; a queued one with the same tag is replaced. */
export function queueNotification(userId: string, payload: PushPayload, deliverAt: Date, db: DbClient = prisma) {
  return db.queuedNotification.upsert({
    where: { userId_tag: { userId, tag: payload.tag } },
    create: { userId, ...payload, deliverAt },
    update: { title: payload.title, body: payload.body, url: payload.url, deliverAt },
  });
}

/** Queued notifications whose quiet hours are over, oldest first. */
export function listDueNotifications(now: Date, take: number, db: DbClient = prisma) {
  return db.queuedNotification.findMany({
    where: { deliverAt: { lte: now } },
    orderBy: { deliverAt: "asc" },
    take,
    select: { id: true, tag: true, title: true, body: true, url: true, user: { select: recipientSelect } },
  });
}

/** Claims a queued notification for delivery: false if another run already took it. */
export async function claimQueuedNotification(id: string, db: DbClient = prisma): Promise<boolean> {
  const { count } = await db.queuedNotification.deleteMany({ where: { id } });
  return count === 1;
}

/** People the scheduler may have something for: a time zone, notifications on, and a subscription. */
export function listScheduledRecipients(db: DbClient = prisma) {
  return db.userSettings.findMany({
    where: {
      timeZone: { not: null },
      notificationsEnabled: true,
      OR: [{ notifyOnThisDay: true }, { notifyWrapped: true }],
      user: { pushSubscriptions: { some: {} } },
    },
    select: { onThisDayCheckedOn: true, wrappedAnnouncedYear: true, user: { select: recipientSelect } },
  });
}

/** Marks On This Day as done for the person's local day; false if it already was. */
export async function claimOnThisDay(userId: string, day: string, db: DbClient = prisma): Promise<boolean> {
  const { count } = await db.userSettings.updateMany({
    where: { userId, OR: [{ onThisDayCheckedOn: null }, { onThisDayCheckedOn: { not: day } }] },
    data: { onThisDayCheckedOn: day },
  });
  return count === 1;
}

/** Marks a year's Wrapped as announced to the person; false if it already was. */
export async function claimWrappedAnnouncement(userId: string, year: number, db: DbClient = prisma): Promise<boolean> {
  const { count } = await db.userSettings.updateMany({
    where: { userId, OR: [{ wrappedAnnouncedYear: null }, { wrappedAnnouncedYear: { lt: year } }] },
    data: { wrappedAnnouncedYear: year },
  });
  return count === 1;
}

/** The groups the person is in and hasn't muted. */
export function listUnmutedGroups(userId: string, db: DbClient = prisma) {
  return db.groupMember.findMany({
    where: { userId, muted: false },
    select: { group: { select: { id: true, name: true, emoji: true } } },
  });
}

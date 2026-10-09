import type { Prisma } from "../../generated/prisma/client.js";
import type { PushPayload } from "../../lib/push.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { settingsSelect } from "../settings/settings.dto.js";

const subscriptionSelect = { id: true, endpoint: true, p256dh: true, auth: true } satisfies Prisma.PushSubscriptionSelect;

/** An iPhone, and when the session that registered it runs out (after that it gets nothing). */
const deviceSelect = {
  id: true,
  token: true,
  environment: true,
  session: { select: { expiresAt: true } },
} satisfies Prisma.ApnsDeviceSelect;

/** Everything needed to decide whether, when and where to notify someone. */
export const recipientSelect = {
  id: true,
  settings: { select: settingsSelect },
  pushSubscriptions: { select: subscriptionSelect },
  apnsDevices: { select: deviceSelect },
} satisfies Prisma.UserSelect;

export type RecipientRow = Prisma.UserGetPayload<{ select: typeof recipientSelect }>;

/** Anyone with a browser or an iPhone to notify. */
export const hasPushTarget = {
  OR: [{ pushSubscriptions: { some: {} } }, { apnsDevices: { some: {} } }],
} satisfies Prisma.UserWhereInput;

/**
 * Registers an iPhone for the session it came with. The same phone again (same token) updates
 * it, and moves it to whoever is signed in on it now.
 */
export function upsertDevice(
  userId: string,
  sessionId: string,
  { token, environment }: { token: string; environment: "SANDBOX" | "PRODUCTION" },
  db: DbClient = prisma,
) {
  return db.apnsDevice.upsert({
    where: { token },
    create: { userId, sessionId, token, environment },
    update: { userId, sessionId, environment },
    select: { id: true },
  });
}

export function deleteDevice(userId: string, token: string, db: DbClient = prisma) {
  return db.apnsDevice.deleteMany({ where: { userId, token } });
}

/** For tokens Apple says are dead. */
export function deleteDeviceById(id: string, db: DbClient = prisma) {
  return db.apnsDevice.deleteMany({ where: { id } });
}

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
 * Members of the group who could be notified (they have a browser or an iPhone to send to
 * and haven't muted the group), out of `userIds`, or out of everyone in the group when it's null.
 */
export async function findGroupRecipients(groupId: string, userIds: string[] | null, db: DbClient = prisma) {
  const rows = await db.groupMember.findMany({
    where: {
      groupId,
      muted: false,
      ...(userIds && { userId: { in: userIds } }),
      user: hasPushTarget,
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

/** People the scheduler may have something for: a time zone, notifications on, and somewhere to send them. */
export function listScheduledRecipients(db: DbClient = prisma) {
  return db.userSettings.findMany({
    where: {
      timeZone: { not: null },
      notificationsEnabled: true,
      OR: [{ notifyOnThisDay: true }, { notifyWrapped: true }, { notifyNudges: true }],
      user: hasPushTarget,
    },
    select: {
      onThisDayCheckedOn: true,
      wrappedAnnouncedYear: true,
      nudgedAt: true,
      nudgeCheckedOn: true,
      user: { select: recipientSelect },
    },
  });
}

/** Marks the person as looked at for a nudge on their local day; false if they already were. */
export async function claimNudgeCheck(userId: string, day: string, db: DbClient = prisma): Promise<boolean> {
  const { count } = await db.userSettings.updateMany({
    where: { userId, OR: [{ nudgeCheckedOn: null }, { nudgeCheckedOn: { not: day } }] },
    data: { nudgeCheckedOn: day },
  });
  return count === 1;
}

/**
 * Records a nudge, unless the person had one at or after `notBefore`: false then. Two scheduler
 * runs at once can't both send, so a person gets at most one a fortnight.
 */
export async function claimNudge(userId: string, now: Date, notBefore: Date, db: DbClient = prisma): Promise<boolean> {
  const { count } = await db.userSettings.updateMany({
    where: { userId, OR: [{ nudgedAt: null }, { nudgedAt: { lte: notBefore } }] },
    data: { nudgedAt: now },
  });
  return count === 1;
}

type NudgeGroupRow = { id: string; name: string; emoji: string };

/**
 * The group to nudge the person about, or null. They must not have posted anywhere since
 * `quietSince`; the group must be one they've been in since `memberBefore`, haven't muted,
 * and where somebody else has posted since `activeSince` (so there is something to join).
 * Of those, the one with the newest photo from someone else.
 */
export async function findNudgeGroup(
  userId: string,
  { quietSince, memberBefore, activeSince }: { quietSince: Date; memberBefore: Date; activeSince: Date },
  db: DbClient = prisma,
): Promise<NudgeGroupRow | null> {
  const rows = await db.$queryRaw<NudgeGroupRow[]>`
    SELECT g.id AS id, g.name AS name, g.emoji AS emoji
    FROM group_members m
    JOIN \`groups\` g ON g.id = m.group_id
    WHERE m.user_id = ${userId}
      AND m.muted = 0
      AND m.joined_at <= ${memberBefore}
      AND NOT EXISTS (SELECT 1 FROM photos own WHERE own.uploader_id = m.user_id AND own.created_at > ${quietSince})
      AND EXISTS (
        SELECT 1 FROM photos other
        WHERE other.group_id = m.group_id AND other.uploader_id <> m.user_id AND other.created_at > ${activeSince}
      )
    ORDER BY (
      SELECT MAX(latest.created_at) FROM photos latest
      WHERE latest.group_id = m.group_id AND latest.uploader_id <> m.user_id
    ) DESC
    LIMIT 1`;
  return rows[0] ?? null;
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

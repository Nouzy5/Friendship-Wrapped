import type { Prisma } from "../../generated/prisma/client.js";
import { before, type Cursor } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";

/** Reads for the admin panel. Everything here is read-only; the few changes it can make go through the modules that own them. */

// ---------------------------------------------------------------------------------------
// Overview

const sessionsActiveSince = async (since: Date) =>
  (await prisma.session.groupBy({ by: ["userId"], where: { lastActiveAt: { gte: since } } })).length;

export async function countActiveUsers(now: Date) {
  const DAY = 24 * 60 * 60 * 1000;
  const [day, week, month] = await Promise.all([
    sessionsActiveSince(new Date(now.getTime() - DAY)),
    sessionsActiveSince(new Date(now.getTime() - 7 * DAY)),
    sessionsActiveSince(new Date(now.getTime() - 30 * DAY)),
  ]);
  return { last24Hours: day, last7Days: week, last30Days: month };
}

export async function countUsers(now: Date) {
  const DAY = 24 * 60 * 60 * 1000;
  const [total, verified, unverified, withoutEmail, newLast7Days, newLast30Days] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    prisma.user.count({ where: { email: { not: null }, emailVerifiedAt: null } }),
    prisma.user.count({ where: { email: null } }),
    prisma.user.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    prisma.user.count({ where: { createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
  ]);
  return { total, verified, unverified, withoutEmail, newLast7Days, newLast30Days };
}

export async function countContent() {
  const [photos, videos, comments, reactions, favorites, albums, moments, wrapped, groups, groupsLast30Days] = await Promise.all([
    prisma.photo.count({ where: { kind: "PHOTO" } }),
    prisma.photo.count({ where: { kind: "VIDEO" } }),
    prisma.comment.count(),
    prisma.reaction.count(),
    prisma.favorite.count(),
    prisma.album.count(),
    prisma.moment.count(),
    prisma.wrapped.count(),
    prisma.group.count(),
    prisma.group.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
  ]);
  return { photos, videos, comments, reactions, favorites, albums, moments, wrapped, groups, groupsLast30Days };
}

/** The bytes of every full-size image and video (the smaller renditions aren't counted). */
export async function sumStorageBytes(where: Prisma.PhotoWhereInput = {}) {
  const { _sum } = await prisma.photo.aggregate({ where, _sum: { sizeBytes: true, videoSizeBytes: true } });
  return (_sum.sizeBytes ?? 0) + (_sum.videoSizeBytes ?? 0);
}

export async function countSafetyAndNotifications(now: Date) {
  const [reports, reportsLast7Days, blocks, webPush, iphones, queued] = await Promise.all([
    prisma.report.count(),
    prisma.report.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } } }),
    prisma.block.count(),
    prisma.pushSubscription.count(),
    prisma.apnsDevice.count(),
    prisma.queuedNotification.count(),
  ]);
  return { reports, reportsLast7Days, blocks, webPush, iphones, queued };
}

/** When each user signed up / each post was made since `since`, for the daily charts. */
export async function listSignupTimes(since: Date): Promise<Date[]> {
  const rows = await prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } });
  return rows.map((row) => row.createdAt);
}

export async function listPostTimes(since: Date): Promise<Date[]> {
  const rows = await prisma.photo.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } });
  return rows.map((row) => row.createdAt);
}

// ---------------------------------------------------------------------------------------
// Users

export type UserFilter = "all" | "verified" | "unverified" | "no-email";

/** Prisma's `contains` passes % and _ through to LIKE as wildcards: a search for "50%" must find "50%", not everything. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function userWhere(q: string | undefined, filter: UserFilter, cursor: Cursor | undefined): Prisma.UserWhereInput {
  const search: Prisma.UserWhereInput = q
    ? {
        OR: [
          { username: { contains: escapeLike(q) } },
          { displayName: { contains: escapeLike(q) } },
          { email: { contains: escapeLike(q) } },
          ...(UUID.test(q) ? [{ id: q.toLowerCase() }] : []),
        ],
      }
    : {};
  const status: Prisma.UserWhereInput =
    filter === "verified"
      ? { emailVerifiedAt: { not: null } }
      : filter === "unverified"
        ? { email: { not: null }, emailVerifiedAt: null }
        : filter === "no-email"
          ? { email: null }
          : {};
  return { AND: [search, status, cursor ? before(cursor) : {}] };
}

/** `limit + 1` rows, newest accounts first, for keyset paging. */
export function listUsers(input: { q?: string; filter: UserFilter; cursor?: Cursor; limit: number }) {
  return prisma.user.findMany({
    where: userWhere(input.q, input.filter, input.cursor),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      emailVerifiedAt: true,
      createdAt: true,
      _count: { select: { memberships: true, photos: true } },
      sessions: { orderBy: { lastActiveAt: "desc" }, take: 1, select: { lastActiveAt: true } },
    },
  });
}

export function findUserDetail(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      emailVerifiedAt: true,
      avatarKey: true,
      createdAt: true,
      _count: {
        select: {
          photos: true,
          comments: true,
          reactions: true,
          favorites: true,
          albums: true,
          moments: true,
          reportsMade: true,
          reportsReceived: true,
          blocksMade: true,
          blocksReceived: true,
          pushSubscriptions: true,
          apnsDevices: true,
        },
      },
      memberships: {
        orderBy: { joinedAt: "desc" },
        select: {
          role: true,
          color: true,
          muted: true,
          joinedAt: true,
          group: { select: { id: true, name: true, emoji: true, _count: { select: { members: true } } } },
        },
      },
      sessions: {
        where: { expiresAt: { gt: new Date() } },
        orderBy: { lastActiveAt: "desc" },
        select: { id: true, userAgent: true, createdAt: true, lastActiveAt: true },
      },
    },
  });
}

export function countVideosBy(userId: string) {
  return prisma.photo.count({ where: { uploaderId: userId, kind: "VIDEO" } });
}

// ---------------------------------------------------------------------------------------
// Groups

function groupWhere(q: string | undefined, cursor: Cursor | undefined): Prisma.GroupWhereInput {
  const search: Prisma.GroupWhereInput = q ? { OR: [{ name: { contains: escapeLike(q) } }, ...(UUID.test(q) ? [{ id: q.toLowerCase() }] : [])] } : {};
  return { AND: [search, cursor ? before(cursor) : {}] };
}

export function listGroups(input: { q?: string; cursor?: Cursor; limit: number }) {
  return prisma.group.findMany({
    where: groupWhere(input.q, input.cursor),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: {
      id: true,
      name: true,
      emoji: true,
      createdAt: true,
      _count: { select: { members: true, photos: true } },
      members: { where: { role: "OWNER" }, take: 1, select: { user: { select: { id: true, username: true, displayName: true } } } },
      photos: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
}

export function findGroupDetail(id: string) {
  return prisma.group.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      emoji: true,
      createdAt: true,
      members: {
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        select: {
          role: true,
          color: true,
          muted: true,
          joinedAt: true,
          user: { select: { id: true, username: true, displayName: true } },
        },
      },
      _count: { select: { albums: true, moments: true, wrapped: true, photos: true } },
      wrapped: { orderBy: { year: "desc" }, select: { year: true } },
    },
  });
}

export async function countGroupActivity(groupId: string, now: Date) {
  const [videos, comments, reactions, activeInvites, lastPost, openMoment] = await Promise.all([
    prisma.photo.count({ where: { groupId, kind: "VIDEO" } }),
    prisma.comment.count({ where: { photo: { groupId } } }),
    prisma.reaction.count({ where: { photo: { groupId } } }),
    prisma.inviteToken.count({ where: { groupId, expiresAt: { gt: now } } }),
    prisma.photo.findFirst({ where: { groupId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.moment.findFirst({ where: { groupId, endsAt: { gt: now } }, select: { title: true, emoji: true, endsAt: true } }),
  ]);
  return { videos, comments, reactions, activeInvites, lastPostAt: lastPost?.createdAt ?? null, openMoment };
}

// ---------------------------------------------------------------------------------------
// Reports

export function listReports(input: { cursor?: Cursor; limit: number }) {
  return prisma.report.findMany({
    where: input.cursor ? before(input.cursor) : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: {
      id: true,
      message: true,
      createdAt: true,
      photoId: true,
      reporter: { select: { id: true, username: true, displayName: true } },
      reportedUser: { select: { id: true, username: true, displayName: true } },
      photo: { select: { id: true, caption: true, kind: true, group: { select: { id: true, name: true, emoji: true } }, uploader: { select: { id: true, username: true } } } },
    },
  });
}

// ---------------------------------------------------------------------------------------
// System checks

export async function databaseVersion(): Promise<string> {
  const rows = await prisma.$queryRaw<{ version: string }[]>`SELECT VERSION() AS version`;
  return rows[0]?.version ?? "unknown";
}

/** What `prisma migrate deploy` has recorded: how many ran, whether one failed, and the latest. */
export async function migrationStatus() {
  const rows = await prisma.$queryRaw<
    { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
  >`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC`;
  const applied = rows.filter((row) => row.finished_at !== null && row.rolled_back_at === null);
  const failed = rows.filter((row) => row.finished_at === null && row.rolled_back_at === null);
  return { applied: applied.length, failed: failed.map((row) => row.migration_name), latest: applied[0]?.migration_name ?? null };
}

export async function integrityCounts(now: Date) {
  const DAY = 24 * 60 * 60 * 1000;
  const [groupsWithoutOwner, ownersPerGroup, groupsWithoutMembers, expiredSessions, expiredLinks, staleUnverified, withoutEmail, overdueQueue] =
    await Promise.all([
      prisma.group.count({ where: { members: { none: { role: "OWNER" } } } }),
      prisma.groupMember.groupBy({ by: ["groupId"], where: { role: "OWNER" }, _count: { _all: true } }),
      prisma.group.count({ where: { members: { none: {} } } }),
      prisma.session.count({ where: { expiresAt: { lte: now } } }),
      prisma.emailVerificationToken.count({ where: { expiresAt: { lte: now } } }),
      prisma.user.count({ where: { email: { not: null }, emailVerifiedAt: null, createdAt: { lt: new Date(now.getTime() - 7 * DAY) } } }),
      prisma.user.count({ where: { email: null } }),
      prisma.queuedNotification.count({ where: { deliverAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } } }),
    ]);
  return {
    groupsWithoutOwner,
    groupsWithSeveralOwners: ownersPerGroup.filter((row) => row._count._all > 1).length,
    groupsWithoutMembers,
    expiredSessions,
    expiredLinks,
    staleUnverified,
    withoutEmail,
    overdueQueue,
  };
}

/** The newest verification link's age for an account, for the admin's detail view. */
export async function newestVerificationLink(userId: string) {
  const row = await prisma.emailVerificationToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, expiresAt: true },
  });
  return row;
}

import { adminEmails } from "../../config/env.js";
import { AppError, badRequest, notFound } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { toPage } from "../../lib/pagination.js";
import { withTransaction } from "../../lib/prisma.js";
import * as storage from "../../lib/storage.js";
import { deviceLabel, publicSessionId } from "../auth/session.dto.js";
import * as devicesRepository from "../auth/devices.repository.js";
import { resendVerificationEmail } from "../auth/email-verification.service.js";
import * as emailVerificationRepository from "../auth/email-verification.repository.js";
import { revokeAllSessions } from "../auth/session.service.js";
import * as groupsRepository from "../groups/groups.repository.js";
import { leaveGroup } from "../groups/groups.service.js";
import { groupStoragePrefix } from "../photos/photo-keys.js";
import * as usersRepository from "../users/users.repository.js";
import { removeAccount } from "../users/users.service.js";
import * as repository from "./admin.repository.js";
import type { ListGroupsQuery, ListReportsQuery, ListUsersQuery } from "./admin.schemas.js";

/** Who did what, in the server log: the admin panel can sign people out and delete things. */
function audit(admin: string, action: string): void {
  logger.info(`Admin ${admin}: ${action}`);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `days` buckets ending today (UTC), oldest first, each counting the times that fell on that day. */
function countPerDay(times: Date[], days: number, now: Date): { date: string; count: number }[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const buckets = Array.from({ length: days }, (_, index) => ({
    date: new Date(today - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10),
    count: 0,
  }));
  const byDate = new Map(buckets.map((bucket) => [bucket.date, bucket]));
  for (const time of times) {
    const bucket = byDate.get(time.toISOString().slice(0, 10));
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

const isAdminAddress = (email: string | null, verified: boolean) => verified && email !== null && adminEmails.has(email);

// ---------------------------------------------------------------------------------------
// Overview

export async function getOverview(now = new Date()) {
  const since = new Date(now.getTime() - 29 * DAY_MS);
  since.setUTCHours(0, 0, 0, 0);

  const [users, active, content, storageBytes, safety, signupTimes, postTimes] = await Promise.all([
    repository.countUsers(now),
    repository.countActiveUsers(now),
    repository.countContent(),
    repository.sumStorageBytes(),
    repository.countSafetyAndNotifications(now),
    repository.listSignupTimes(since),
    repository.listPostTimes(since),
  ]);

  return {
    generatedAt: now.toISOString(),
    users: { ...users, active },
    groups: { total: content.groups, createdLast30Days: content.groupsLast30Days },
    content: {
      photos: content.photos,
      videos: content.videos,
      comments: content.comments,
      reactions: content.reactions,
      favorites: content.favorites,
      albums: content.albums,
      moments: content.moments,
      wrapped: content.wrapped,
      storageBytes,
    },
    safety: { reports: safety.reports, reportsLast7Days: safety.reportsLast7Days, blocks: safety.blocks },
    notifications: { webPushSubscriptions: safety.webPush, iphoneDevices: safety.iphones, queued: safety.queued },
    daily: { signups: countPerDay(signupTimes, 30, now), posts: countPerDay(postTimes, 30, now) },
  };
}

// ---------------------------------------------------------------------------------------
// Users

export async function listUsers(query: ListUsersQuery) {
  const rows = await repository.listUsers({ q: query.q || undefined, filter: query.filter, cursor: query.cursor, limit: query.limit });
  const { items, nextCursor } = toPage(rows, query.limit);

  return {
    users: items.map((row) => {
      const emailVerified = row.email !== null && row.emailVerifiedAt !== null;
      return {
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        email: row.email,
        emailVerified,
        isAdmin: isAdminAddress(row.email, emailVerified),
        createdAt: row.createdAt,
        lastActiveAt: row.sessions[0]?.lastActiveAt ?? null,
        groupCount: row._count.memberships,
        photoCount: row._count.photos,
      };
    }),
    nextCursor,
  };
}

export async function getUser(userId: string) {
  const user = await repository.findUserDetail(userId);
  if (!user) throw notFound("User not found");

  const [videos, storageBytes, devices, link] = await Promise.all([
    repository.countVideosBy(userId),
    repository.sumStorageBytes({ uploaderId: userId }),
    devicesRepository.listDevices(userId),
    repository.newestVerificationLink(userId),
  ]);
  const { _count: counts } = user;
  const emailVerified = user.email !== null && user.emailVerifiedAt !== null;

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      emailVerified,
      emailVerifiedAt: user.emailVerifiedAt,
      isAdmin: isAdminAddress(user.email, emailVerified),
      hasAvatar: user.avatarKey !== null,
      createdAt: user.createdAt,
    },
    stats: {
      photos: counts.photos - videos,
      videos,
      comments: counts.comments,
      reactionsGiven: counts.reactions,
      favorites: counts.favorites,
      albumsCreated: counts.albums,
      momentsStarted: counts.moments,
      reportsMade: counts.reportsMade,
      reportsAgainst: counts.reportsReceived,
      peopleBlocked: counts.blocksMade,
      blockedBy: counts.blocksReceived,
      storageBytes,
    },
    notifications: { webPushSubscriptions: counts.pushSubscriptions, iphoneDevices: counts.apnsDevices },
    groups: user.memberships.map((membership) => ({
      id: membership.group.id,
      name: membership.group.name,
      emoji: membership.group.emoji,
      memberCount: membership.group._count.members,
      role: membership.role,
      color: membership.color,
      muted: membership.muted,
      joinedAt: membership.joinedAt,
    })),
    sessions: user.sessions.map((session) => ({
      id: publicSessionId(session.id),
      device: deviceLabel(session.userAgent),
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
    })),
    knownDevices: devices,
    verificationLink: link ? { sentAt: link.createdAt, expiresAt: link.expiresAt } : null,
  };
}

/** For an account whose owner can't get the email (or when no mail server is set up yet). */
export async function markEmailVerified(admin: string, userId: string): Promise<void> {
  const account = await usersRepository.findEmailAccount(userId);
  if (!account) throw notFound("User not found");
  if (!account.email) throw badRequest("This account has no email address to verify");
  if (account.emailVerifiedAt) return;
  if (adminEmails.has(account.email)) {
    // Whoever holds an admin address becomes an admin: only its real owner may confirm it.
    throw badRequest(
      "That address opens the admin panel, so it can only be confirmed by its owner, with the emailed link or with the verify-email command on the server",
    );
  }

  await usersRepository.markEmailVerified(userId, account.email, new Date());
  await emailVerificationRepository.deleteTokensForUser(userId);
  audit(admin, `marked ${account.email} (@${account.username}) as verified`);
}

export async function resendVerification(admin: string, userId: string): Promise<void> {
  const account = await usersRepository.findEmailAccount(userId);
  if (!account) throw notFound("User not found");
  await resendVerificationEmail(userId);
  audit(admin, `re-sent the verification email to @${account.username}`);
}

export async function signOutEverywhere(admin: string, userId: string): Promise<{ signedOut: number }> {
  const account = await usersRepository.findEmailAccount(userId);
  if (!account) throw notFound("User not found");
  const signedOut = await revokeAllSessions(userId);
  audit(admin, `signed @${account.username} out of ${signedOut} session(s)`);
  return { signedOut };
}

/** Deletes an account like its owner could (see users.service), once the admin has typed the username. */
export async function deleteUser(adminId: string, admin: string, userId: string, confirm: string): Promise<void> {
  const user = await repository.findUserDetail(userId);
  if (!user) throw notFound("User not found");

  if (userId === adminId) throw badRequest("You can't delete your own account from the admin panel");
  if (isAdminAddress(user.email, user.emailVerifiedAt !== null)) throw badRequest("An admin account can't be deleted from the admin panel");
  if (confirm.trim().toLowerCase() !== user.username) {
    throw new AppError(400, "CONFIRMATION_MISMATCH", "Type the username to confirm", [
      { path: "confirm", message: `Type ${user.username} to confirm` },
    ]);
  }

  await removeAccount(userId);
  audit(admin, `deleted the account @${user.username} (${user.email ?? "no email"})`);
}

// ---------------------------------------------------------------------------------------
// Groups

export async function listGroups(query: ListGroupsQuery) {
  const rows = await repository.listGroups({ q: query.q || undefined, cursor: query.cursor, limit: query.limit });
  const { items, nextCursor } = toPage(rows, query.limit);

  return {
    groups: items.map((row) => ({
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      createdAt: row.createdAt,
      memberCount: row._count.members,
      photoCount: row._count.photos,
      lastPostAt: row.photos[0]?.createdAt ?? null,
      owner: row.members[0]?.user ?? null,
    })),
    nextCursor,
  };
}

export async function getGroup(groupId: string, now = new Date()) {
  const group = await repository.findGroupDetail(groupId);
  if (!group) throw notFound("Group not found");

  const [activity, storageBytes] = await Promise.all([
    repository.countGroupActivity(groupId, now),
    repository.sumStorageBytes({ groupId }),
  ]);

  return {
    group: { id: group.id, name: group.name, emoji: group.emoji, createdAt: group.createdAt },
    members: group.members.map((member) => ({
      ...member.user,
      role: member.role,
      color: member.color,
      muted: member.muted,
      joinedAt: member.joinedAt,
    })),
    stats: {
      photos: group._count.photos - activity.videos,
      videos: activity.videos,
      comments: activity.comments,
      reactions: activity.reactions,
      albums: group._count.albums,
      moments: group._count.moments,
      storageBytes,
      activeInvites: activity.activeInvites,
      lastPostAt: activity.lastPostAt,
    },
    openMoment: activity.openMoment,
    wrappedYears: group.wrapped.map((wrapped) => wrapped.year),
  };
}

/** Takes someone out of a group the way leaving does: an owner's role passes on, an emptied group is deleted. */
export async function removeMember(admin: string, groupId: string, userId: string): Promise<{ groupDeleted: boolean }> {
  const group = await repository.findGroupDetail(groupId);
  const member = group?.members.find((candidate) => candidate.user.id === userId);
  if (!group || !member) throw notFound("That person isn't in this group");

  const result = await leaveGroup(groupId, userId);
  audit(admin, `removed @${member.user.username} from the group "${group.name}"${result.groupDeleted ? " (which left it empty, so it was deleted)" : ""}`);
  return result;
}

export async function deleteGroup(admin: string, groupId: string, confirm: string): Promise<void> {
  const group = await repository.findGroupDetail(groupId);
  if (!group) throw notFound("Group not found");
  if (confirm.trim() !== group.name) {
    throw new AppError(400, "CONFIRMATION_MISMATCH", "Type the group's name to confirm", [
      { path: "confirm", message: `Type ${group.name} to confirm` },
    ]);
  }

  await withTransaction((tx) => groupsRepository.deleteGroup(groupId, tx)); // cascades to memberships, invites and photos
  await storage.discardPrefix(groupStoragePrefix(groupId));
  audit(admin, `deleted the group "${group.name}" with ${group._count.photos} post(s)`);
}

// ---------------------------------------------------------------------------------------
// Reports

export async function listReports(query: ListReportsQuery) {
  const rows = await repository.listReports({ cursor: query.cursor, limit: query.limit });
  const { items, nextCursor } = toPage(rows, query.limit);

  return {
    reports: items.map((row) => ({
      id: row.id,
      message: row.message,
      createdAt: row.createdAt,
      reporter: row.reporter,
      reportedUser: row.reportedUser,
      photo: row.photo
        ? {
            id: row.photo.id,
            caption: row.photo.caption,
            kind: row.photo.kind === "VIDEO" ? ("video" as const) : ("photo" as const),
            group: row.photo.group,
            uploader: row.photo.uploader,
          }
        : null,
    })),
    nextCursor,
  };
}

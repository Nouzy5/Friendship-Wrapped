import { AppError, notFound } from "../../lib/errors.js";
import { isUniqueConstraintError, withTransaction } from "../../lib/prisma.js";
import { generateToken, sha256Hex } from "../../lib/tokens.js";
import { groupAvatarUrl, type GroupView } from "../groups/group.dto.js";
import * as groupsRepository from "../groups/groups.repository.js";
import * as groupsService from "../groups/groups.service.js";
import * as notifications from "../notifications/notifications.service.js";
import * as invitesRepository from "./invites.repository.js";
import { DEFAULT_INVITE_LIFETIME_DAYS, INVITE_TOKEN_PATTERN, publicInviteId } from "./invites.schemas.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long an expired invite is kept. Its link then says who sent it ("Ask Sam for a new
 * one"); after this it is deleted and the link is simply invalid.
 */
const EXPIRED_INVITE_KEPT_MS = 30 * DAY_MS;

export type CreatedInvite = { token: string; expiresAt: Date };

/** What someone holding an invite link may see before joining. */
export type InvitePreview = {
  group: { name: string; emoji: string; memberCount: number };
  /** Who made the link. */
  invitedBy: string;
  expiresAt: Date;
  /** The group id, only revealed to people who are already members. */
  memberOfGroupId: string | null;
};

const invalidInvite = () => new AppError(404, "INVITE_INVALID", "This invite link is invalid or has been turned off");

/**
 * A link that ran out. It's a 404 like any dead link (older apps only look at the status), but
 * with its own code and who sent it, so the page can say who to ask for a new one.
 */
const expiredInvite = (invite: { createdBy: { displayName: string }; group: { name: string; emoji: string } }) =>
  new AppError(404, "INVITE_EXPIRED", "This invite link has expired", {
    invitedBy: invite.createdBy.displayName,
    groupName: invite.group.name,
    groupEmoji: invite.group.emoji,
  });

async function findValidInvite(token: string) {
  if (!INVITE_TOKEN_PATTERN.test(token)) throw invalidInvite();

  const invite = await invitesRepository.findInviteWithGroup(sha256Hex(token));
  if (!invite) throw invalidInvite();

  const now = Date.now();
  if (invite.expiresAt.getTime() <= now) {
    // Past the retention it counts as gone, whether or not a new link has swept it up yet.
    if (invite.expiresAt.getTime() + EXPIRED_INVITE_KEPT_MS <= now) throw invalidInvite();
    throw expiredInvite(invite);
  }
  return invite;
}

/**
 * Any member can create a link, lasting 1, 7 (the default) or 30 days. Only its hash is
 * stored, so it can't be shown again later.
 */
export async function createInvite(
  groupId: string,
  userId: string,
  lifetimeDays: number = DEFAULT_INVITE_LIFETIME_DAYS,
): Promise<CreatedInvite> {
  const token = generateToken(16);
  const expiresAt = new Date(Date.now() + lifetimeDays * DAY_MS);

  // Checked and written together, so someone being removed at this moment can't keep a fresh link.
  await withTransaction(async (tx) => {
    await groupsService.requireMembership(groupId, userId, tx);
    await invitesRepository.createInvite({ id: sha256Hex(token), groupId, createdById: userId, expiresAt }, tx);
  });
  await invitesRepository.deleteInvitesExpiredBefore(groupId, new Date(Date.now() - EXPIRED_INVITE_KEPT_MS));

  return { token, expiresAt };
}

export async function previewInvite(token: string, viewerId: string | null): Promise<InvitePreview> {
  const { group, createdBy, expiresAt } = await findValidInvite(token);
  const membership = viewerId ? await groupsRepository.findMembership(group.id, viewerId) : null;

  return {
    group: { name: group.name, emoji: group.emoji, memberCount: group._count.members },
    invitedBy: createdBy.displayName,
    expiresAt,
    memberOfGroupId: membership ? group.id : null,
  };
}

/**
 * Joins the group, with the first colour free. Accepting again (double tap, already a
 * member) is a harmless no-op.
 */
export async function acceptInvite(token: string, userId: string): Promise<GroupView> {
  const { group } = await findValidInvite(token);

  let joined = false;
  try {
    joined = await withTransaction(async (tx) => {
      if (await groupsRepository.findMembership(group.id, userId, tx)) return false;
      await groupsService.addMember(group.id, userId, tx);
      return true;
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error; // a concurrent accept already added them
  }

  if (joined) notifications.memberJoined(group.id, userId);
  return groupsService.getGroup(group.id, userId);
}

/** An invite link as its creator sees it in their account: the token itself can't be shown again. */
export type MyInviteView = {
  /** Opaque: a prefix of the stored hash, never the token. */
  id: string;
  group: { id: string; name: string; emoji: string; avatarUrl: string | null };
  createdAt: Date;
  expiresAt: Date;
};

/** The invite links the user created that still work, newest first. */
export async function listMyInvites(userId: string): Promise<MyInviteView[]> {
  const invites = await invitesRepository.listInvitesCreatedBy(userId, new Date());
  return invites.map(({ id, group, createdAt, expiresAt }) => ({
    id: publicInviteId(id),
    group: { id: group.id, name: group.name, emoji: group.emoji, avatarUrl: groupAvatarUrl(group.id, group.avatarKey) },
    createdAt,
    expiresAt,
  }));
}

/** Stops one of your own invite links working. */
export async function revokeMyInvite(userId: string, inviteId: string): Promise<void> {
  const { count } = await invitesRepository.deleteInviteCreatedBy(userId, inviteId);
  if (count === 0) throw notFound("Invite not found");
}

/** Owner-only: every existing invite link for the group stops working. */
export async function resetInvites(groupId: string, userId: string): Promise<void> {
  await groupsService.requireOwner(groupId, userId);
  await invitesRepository.deleteInvitesForGroup(groupId);
}

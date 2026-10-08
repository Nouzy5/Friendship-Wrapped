import { AppError, notFound } from "../../lib/errors.js";
import { isUniqueConstraintError, withTransaction } from "../../lib/prisma.js";
import { generateToken, sha256Hex } from "../../lib/tokens.js";
import { groupAvatarUrl, type GroupView } from "../groups/group.dto.js";
import * as groupsRepository from "../groups/groups.repository.js";
import * as groupsService from "../groups/groups.service.js";
import * as notifications from "../notifications/notifications.service.js";
import * as invitesRepository from "./invites.repository.js";
import { INVITE_TOKEN_PATTERN, publicInviteId } from "./invites.schemas.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CreatedInvite = { token: string; expiresAt: Date };

/** What someone holding an invite link may see before joining. */
export type InvitePreview = {
  group: { name: string; emoji: string; memberCount: number };
  expiresAt: Date;
  /** The group id, only revealed to people who are already members. */
  memberOfGroupId: string | null;
};

const invalidInvite = () => new AppError(404, "INVITE_INVALID", "This invite link is invalid or has expired");

async function findValidInvite(token: string) {
  if (!INVITE_TOKEN_PATTERN.test(token)) throw invalidInvite();

  const invite = await invitesRepository.findInviteWithGroup(sha256Hex(token));
  if (!invite || invite.expiresAt.getTime() <= Date.now()) throw invalidInvite();
  return invite;
}

/** Any member can create a link. Only its hash is stored, so it can't be shown again later. */
export async function createInvite(groupId: string, userId: string): Promise<CreatedInvite> {
  const token = generateToken(16);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  // Checked and written together, so someone being removed at this moment can't keep a fresh link.
  await withTransaction(async (tx) => {
    await groupsService.requireMembership(groupId, userId, tx);
    await invitesRepository.createInvite({ id: sha256Hex(token), groupId, createdById: userId, expiresAt }, tx);
  });
  await invitesRepository.deleteExpiredInvites(groupId, new Date());

  return { token, expiresAt };
}

export async function previewInvite(token: string, viewerId: string | null): Promise<InvitePreview> {
  const { group, expiresAt } = await findValidInvite(token);
  const membership = viewerId ? await groupsRepository.findMembership(group.id, viewerId) : null;

  return {
    group: { name: group.name, emoji: group.emoji, memberCount: group._count.members },
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

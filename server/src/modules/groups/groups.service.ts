import type { Prisma } from "../../generated/prisma/client.js";
import { AppError, badRequest, forbidden, notFound } from "../../lib/errors.js";
import { IMAGE_CONTENT_TYPE, processAvatar } from "../../lib/images.js";
import { isUniqueConstraintError, prisma, withTransaction, type DbClient } from "../../lib/prisma.js";
import * as storage from "../../lib/storage.js";
import { generateToken } from "../../lib/tokens.js";
import * as invitesRepository from "../invites/invites.repository.js";
import { groupStoragePrefix } from "../photos/photo-keys.js";
import {
  MEMBER_COLORS,
  firstFreeColor,
  toGroupMemberView,
  toGroupView,
  type GroupMemberView,
  type GroupView,
} from "./group.dto.js";
import * as groupsRepository from "./groups.repository.js";
import type { CreateGroupInput, UpdateGroupInput, UpdateMyMembershipInput } from "./groups.schemas.js";

/**
 * The authorization gate for everything inside a group. Non-members get a 404, not a
 * 403, so they can't even learn that a group with this id exists.
 */
export async function requireMembership(groupId: string, userId: string, db: DbClient = prisma) {
  const membership = await groupsRepository.findMembership(groupId, userId, db);
  if (!membership) throw notFound("Group not found");
  return membership;
}

/** For features that behave differently for members, rather than refusing everyone else. */
export async function isMember(groupId: string, userId: string, db: DbClient = prisma): Promise<boolean> {
  return (await groupsRepository.findMembership(groupId, userId, db)) !== null;
}

export async function requireOwner(groupId: string, userId: string, db: DbClient = prisma) {
  const membership = await requireMembership(groupId, userId, db);
  if (membership.role !== "OWNER") throw forbidden("Only the group owner can do that");
  return membership;
}

export async function createGroup(userId: string, input: CreateGroupInput): Promise<GroupView> {
  const group = await groupsRepository.createGroupWithOwner(input, userId);
  return toGroupView(group, { role: "OWNER", color: MEMBER_COLORS[0]!, muted: false });
}

/**
 * Adds someone to the group with the first colour free in palette order (none once all
 * twelve are taken). Run it in a serializable transaction, so two people joining at once
 * can't pick the same colour.
 */
export async function addMember(groupId: string, userId: string, tx: Prisma.TransactionClient): Promise<void> {
  const colors = await groupsRepository.listMemberColors(groupId, tx);
  await groupsRepository.addMember(groupId, userId, firstFreeColor(colors.values()), tx);
}

const colorTaken = () =>
  new AppError(409, "COLOR_TAKEN", "Someone in this group already has that colour", [
    { path: "color", message: "Someone in this group already has that colour" },
  ]);

/** Your own colour (any one nobody else in the group has) and whether the group is muted. */
export async function updateMyMembership(
  groupId: string,
  userId: string,
  input: UpdateMyMembershipInput,
): Promise<GroupView> {
  try {
    await withTransaction(async (tx) => {
      await requireMembership(groupId, userId, tx);
      if (input.color) {
        const holder = await groupsRepository.findMemberWithColor(groupId, input.color, tx);
        if (holder && holder.userId !== userId) throw colorTaken();
      }
      await groupsRepository.updateMyMembership(groupId, userId, input, tx);
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw colorTaken();
    throw error;
  }
  return getGroup(groupId, userId);
}

export async function listMyGroups(userId: string): Promise<GroupView[]> {
  const memberships = await groupsRepository.listGroupsForUser(userId);
  return memberships.map(({ group, ...membership }) => toGroupView(group, membership));
}

export async function getGroup(groupId: string, userId: string): Promise<GroupView> {
  const membership = await groupsRepository.findMembershipWithGroup(groupId, userId);
  if (!membership) throw notFound("Group not found");
  const { group, ...mine } = membership;
  return toGroupView(group, mine);
}

export async function updateGroup(groupId: string, userId: string, input: UpdateGroupInput): Promise<GroupView> {
  const membership = await requireOwner(groupId, userId);
  const group = await groupsRepository.updateGroup(groupId, input);
  return toGroupView(group, membership);
}

/** Only the owner changes the group photo, like its name and emoji. Checked before the upload is read. */
export async function assertCanEditGroup(groupId: string, userId: string): Promise<void> {
  await requireOwner(groupId, userId);
}

/** Swaps the stored group photo key and returns the key it replaced. */
function replaceGroupAvatarKey(groupId: string, userId: string, avatarKey: string | null) {
  return withTransaction(async (tx) => {
    await requireOwner(groupId, userId, tx);
    const previous = await groupsRepository.findGroupAvatarKey(groupId, tx);
    await groupsRepository.setGroupAvatarKey(groupId, avatarKey, tx);
    return previous?.avatarKey ?? null;
  });
}

/** Processed like a profile picture, and stored under the group's prefix so deleting the group clears it. */
export async function setGroupAvatar(groupId: string, userId: string, image: Buffer | undefined): Promise<GroupView> {
  if (!image) throw badRequest("Choose a picture to upload");

  const avatar = await processAvatar(image);
  const key = `${groupStoragePrefix(groupId)}avatars/${generateToken(16)}.webp`;
  await storage.putObject(key, avatar.data, IMAGE_CONTENT_TYPE);

  let previousKey: string | null;
  try {
    previousKey = await replaceGroupAvatarKey(groupId, userId, key);
  } catch (error) {
    await storage.discardObjects([key]);
    throw error;
  }

  if (previousKey) await storage.discardObjects([previousKey]);
  return getGroup(groupId, userId);
}

export async function removeGroupAvatar(groupId: string, userId: string): Promise<GroupView> {
  const previousKey = await replaceGroupAvatarKey(groupId, userId, null);
  if (previousKey) await storage.discardObjects([previousKey]);
  return getGroup(groupId, userId);
}

/** Members only, like everything else in the group. */
export async function getGroupAvatarImage(groupId: string, userId: string): Promise<storage.StoredObject> {
  await requireMembership(groupId, userId);
  const avatarKey = (await groupsRepository.findGroupAvatarKey(groupId))?.avatarKey;
  const image = avatarKey ? await storage.getObject(avatarKey) : null;
  if (!image) throw notFound("No group photo");
  return image;
}

export async function listMembers(groupId: string, userId: string): Promise<GroupMemberView[]> {
  await requireMembership(groupId, userId);
  const members = await groupsRepository.listMembers(groupId);
  return members.map(toGroupMemberView);
}

/**
 * Owner-only. Every invite link shared so far stops working too (the removed member may
 * have kept any of them), so they can only come back with a new one.
 */
export async function removeMember(groupId: string, ownerId: string, memberId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await requireOwner(groupId, ownerId, tx);
    if (memberId === ownerId) throw badRequest("To leave a group you own, use “Leave group”");
    const member = await groupsRepository.findMembership(groupId, memberId, tx);
    if (!member) throw notFound("That person isn't in this group");

    await groupsRepository.deleteMembership(groupId, memberId, tx);
    await invitesRepository.deleteInvitesForGroup(groupId, tx);
  });
}

/**
 * Leaving keeps the "exactly one owner" invariant: an owner's role passes to the
 * longest-standing member, and a group whose last member leaves is deleted. Photos
 * stay with the group when someone leaves; they're deleted only with the group itself.
 */
export async function leaveGroup(groupId: string, userId: string): Promise<{ groupDeleted: boolean }> {
  const result = await withTransaction((tx) => leaveInTransaction(groupId, userId, tx));

  // The rows are gone; now remove the group's image files.
  if (result.groupDeleted) await storage.discardPrefix(groupStoragePrefix(groupId));
  return result;
}

/**
 * The database side of leaving, inside the caller's transaction (also used when deleting an
 * account). A deleted group's image files are the caller's to remove afterwards.
 */
export async function leaveInTransaction(
  groupId: string,
  userId: string,
  tx: Prisma.TransactionClient,
): Promise<{ groupDeleted: boolean }> {
  const membership = await requireMembership(groupId, userId, tx);

  if (membership.role === "OWNER") {
    const successor = await groupsRepository.findSuccessor(groupId, userId, tx);
    if (!successor) {
      await groupsRepository.deleteGroup(groupId, tx); // cascades to memberships, invites and photos
      return { groupDeleted: true };
    }
    await groupsRepository.setMemberRole(groupId, successor.userId, "OWNER", tx);
  }

  await groupsRepository.deleteMembership(groupId, userId, tx);
  await invitesRepository.deleteInvitesCreatedBy(groupId, userId, tx);
  return { groupDeleted: false };
}

import type { Prisma } from "../../generated/prisma/client.js";
import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { prisma, withTransaction, type DbClient } from "../../lib/prisma.js";
import * as storage from "../../lib/storage.js";
import * as invitesRepository from "../invites/invites.repository.js";
import { groupStoragePrefix } from "../photos/photo-keys.js";
import { toGroupMemberView, toGroupView, type GroupMemberView, type GroupView } from "./group.dto.js";
import * as groupsRepository from "./groups.repository.js";
import type { CreateGroupInput, UpdateGroupInput } from "./groups.schemas.js";

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
  return toGroupView(group, "OWNER");
}

export async function listMyGroups(userId: string): Promise<GroupView[]> {
  const memberships = await groupsRepository.listGroupsForUser(userId);
  return memberships.map(({ group, role }) => toGroupView(group, role));
}

export async function getGroup(groupId: string, userId: string): Promise<GroupView> {
  const membership = await groupsRepository.findMembershipWithGroup(groupId, userId);
  if (!membership) throw notFound("Group not found");
  return toGroupView(membership.group, membership.role);
}

export async function updateGroup(groupId: string, userId: string, input: UpdateGroupInput): Promise<GroupView> {
  await requireOwner(groupId, userId);
  const group = await groupsRepository.updateGroup(groupId, input);
  return toGroupView(group, "OWNER");
}

export async function listMembers(groupId: string, userId: string): Promise<GroupMemberView[]> {
  await requireMembership(groupId, userId);
  const members = await groupsRepository.listMembers(groupId);
  return members.map(toGroupMemberView);
}

/** Owner-only. Invite links the removed member created stop working too. */
export async function removeMember(groupId: string, ownerId: string, memberId: string): Promise<void> {
  if (memberId === ownerId) throw badRequest("To leave a group you own, use “Leave group”");

  await withTransaction(async (tx) => {
    await requireOwner(groupId, ownerId, tx);
    const member = await groupsRepository.findMembership(groupId, memberId, tx);
    if (!member) throw notFound("That person isn't in this group");

    await groupsRepository.deleteMembership(groupId, memberId, tx);
    await invitesRepository.deleteInvitesCreatedBy(groupId, memberId, tx);
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

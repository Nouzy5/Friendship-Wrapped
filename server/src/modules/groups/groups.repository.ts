import type { GroupRole } from "../../generated/prisma/client.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { groupMemberSelect, groupSummarySelect } from "./group.dto.js";

/** Creates the group and its owner membership in one atomic insert. */
export function createGroupWithOwner(data: { name: string; emoji: string }, ownerId: string, db: DbClient = prisma) {
  return db.group.create({
    data: { ...data, members: { create: { userId: ownerId, role: "OWNER" } } },
    select: groupSummarySelect,
  });
}

export function findMembership(groupId: string, userId: string, db: DbClient = prisma) {
  return db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { role: true },
  });
}

export function findMembershipWithGroup(groupId: string, userId: string, db: DbClient = prisma) {
  return db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { role: true, group: { select: groupSummarySelect } },
  });
}

export function listGroupsForUser(userId: string, db: DbClient = prisma) {
  return db.groupMember.findMany({
    where: { userId },
    orderBy: { joinedAt: "desc" },
    select: { role: true, group: { select: groupSummarySelect } },
  });
}

export function updateGroup(groupId: string, data: { name?: string; emoji?: string }, db: DbClient = prisma) {
  return db.group.update({ where: { id: groupId }, data, select: groupSummarySelect });
}

export function deleteGroup(groupId: string, db: DbClient = prisma) {
  return db.group.delete({ where: { id: groupId } });
}

/** Owner first (ENUM order), then by join date. */
export function listMembers(groupId: string, db: DbClient = prisma) {
  return db.groupMember.findMany({
    where: { groupId },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    select: groupMemberSelect,
  });
}

export function addMember(groupId: string, userId: string, db: DbClient = prisma) {
  return db.groupMember.create({ data: { groupId, userId, role: "MEMBER" } });
}

export function deleteMembership(groupId: string, userId: string, db: DbClient = prisma) {
  return db.groupMember.delete({ where: { groupId_userId: { groupId, userId } } });
}

export function setMemberRole(groupId: string, userId: string, role: GroupRole, db: DbClient = prisma) {
  return db.groupMember.update({ where: { groupId_userId: { groupId, userId } }, data: { role } });
}

/** The longest-standing member other than `excludeUserId`, who inherits ownership. */
export function findSuccessor(groupId: string, excludeUserId: string, db: DbClient = prisma) {
  return db.groupMember.findFirst({
    where: { groupId, userId: { not: excludeUserId } },
    orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
    select: { userId: true },
  });
}

import type { GroupRole, MemberColor } from "../../generated/prisma/client.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { MEMBER_COLORS, groupMemberSelect, groupSummarySelect, myMembershipSelect } from "./group.dto.js";

/** Creates the group and its owner membership (with the palette's first colour) in one atomic insert. */
export function createGroupWithOwner(data: { name: string; emoji: string }, ownerId: string, db: DbClient = prisma) {
  return db.group.create({
    data: { ...data, members: { create: { userId: ownerId, role: "OWNER", color: MEMBER_COLORS[0] } } },
    select: groupSummarySelect,
  });
}

export function findMembership(groupId: string, userId: string, db: DbClient = prisma) {
  return db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: myMembershipSelect,
  });
}

export function findMembershipWithGroup(groupId: string, userId: string, db: DbClient = prisma) {
  return db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { ...myMembershipSelect, group: { select: groupSummarySelect } },
  });
}

export function listGroupsForUser(userId: string, db: DbClient = prisma) {
  return db.groupMember.findMany({
    where: { userId },
    orderBy: { joinedAt: "desc" },
    select: { ...myMembershipSelect, group: { select: groupSummarySelect } },
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

export function addMember(groupId: string, userId: string, color: MemberColor | null, db: DbClient = prisma) {
  return db.groupMember.create({ data: { groupId, userId, role: "MEMBER", color } });
}

export function deleteMembership(groupId: string, userId: string, db: DbClient = prisma) {
  return db.groupMember.delete({ where: { groupId_userId: { groupId, userId } } });
}

export function setMemberRole(groupId: string, userId: string, role: GroupRole, db: DbClient = prisma) {
  return db.groupMember.update({ where: { groupId_userId: { groupId, userId } }, data: { role } });
}

/** Each current member's colour (null for anyone who joined after all twelve were taken). */
export async function listMemberColors(groupId: string, db: DbClient = prisma): Promise<Map<string, MemberColor | null>> {
  const rows = await db.groupMember.findMany({ where: { groupId }, select: { userId: true, color: true } });
  return new Map(rows.map((row) => [row.userId, row.color]));
}

/** Who in the group has this colour, if anyone. */
export function findMemberWithColor(groupId: string, color: MemberColor, db: DbClient = prisma) {
  return db.groupMember.findFirst({ where: { groupId, color }, select: { userId: true } });
}

export function updateMyMembership(
  groupId: string,
  userId: string,
  data: { color?: MemberColor; muted?: boolean },
  db: DbClient = prisma,
) {
  return db.groupMember.update({ where: { groupId_userId: { groupId, userId } }, data });
}

export function findGroupAvatarKey(groupId: string, db: DbClient = prisma) {
  return db.group.findUnique({ where: { id: groupId }, select: { avatarKey: true } });
}

export function setGroupAvatarKey(groupId: string, avatarKey: string | null, db: DbClient = prisma) {
  return db.group.update({ where: { id: groupId }, data: { avatarKey } });
}

/** True when both users are members of at least one common group. */
export async function shareAGroup(userId: string, otherUserId: string, db: DbClient = prisma): Promise<boolean> {
  const shared = await db.groupMember.findFirst({
    where: { userId, group: { members: { some: { userId: otherUserId } } } },
    select: { groupId: true },
  });
  return shared !== null;
}

/** The longest-standing member other than `excludeUserId`, who inherits ownership. */
export function findSuccessor(groupId: string, excludeUserId: string, db: DbClient = prisma) {
  return db.groupMember.findFirst({
    where: { groupId, userId: { not: excludeUserId } },
    orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
    select: { userId: true },
  });
}

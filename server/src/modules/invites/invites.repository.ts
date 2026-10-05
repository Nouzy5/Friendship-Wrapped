import { prisma, type DbClient } from "../../lib/prisma.js";
import { groupSummarySelect } from "../groups/group.dto.js";

export function createInvite(
  data: { id: string; groupId: string; createdById: string; expiresAt: Date },
  db: DbClient = prisma,
) {
  return db.inviteToken.create({ data, select: { id: true } });
}

export function findInviteWithGroup(id: string, db: DbClient = prisma) {
  return db.inviteToken.findUnique({
    where: { id },
    select: { expiresAt: true, group: { select: groupSummarySelect } },
  });
}

export function deleteInvitesForGroup(groupId: string, db: DbClient = prisma) {
  return db.inviteToken.deleteMany({ where: { groupId } });
}

export function deleteInvitesCreatedBy(groupId: string, createdById: string, db: DbClient = prisma) {
  return db.inviteToken.deleteMany({ where: { groupId, createdById } });
}

export function deleteExpiredInvites(groupId: string, now: Date, db: DbClient = prisma) {
  return db.inviteToken.deleteMany({ where: { groupId, expiresAt: { lte: now } } });
}

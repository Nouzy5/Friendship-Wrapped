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
    select: {
      expiresAt: true,
      createdBy: { select: { displayName: true } },
      group: { select: groupSummarySelect },
    },
  });
}

export function deleteInvitesForGroup(groupId: string, db: DbClient = prisma) {
  return db.inviteToken.deleteMany({ where: { groupId } });
}

export function deleteInvitesCreatedBy(groupId: string, createdById: string, db: DbClient = prisma) {
  return db.inviteToken.deleteMany({ where: { groupId, createdById } });
}

/** Unexpired invites the user created, newest first. */
export function listInvitesCreatedBy(createdById: string, now: Date, db: DbClient = prisma) {
  return db.inviteToken.findMany({
    where: { createdById, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      group: { select: { id: true, name: true, emoji: true, avatarKey: true } },
    },
  });
}

/** By the public id (a prefix of the hash), and only the creator's own. */
export function deleteInviteCreatedBy(createdById: string, publicId: string, db: DbClient = prisma) {
  return db.inviteToken.deleteMany({ where: { createdById, id: { startsWith: publicId } } });
}

/** Invites that expired before `cutoff`. Newer expired ones stay so their link can say who sent it. */
export function deleteInvitesExpiredBefore(groupId: string, cutoff: Date, db: DbClient = prisma) {
  return db.inviteToken.deleteMany({ where: { groupId, expiresAt: { lte: cutoff } } });
}

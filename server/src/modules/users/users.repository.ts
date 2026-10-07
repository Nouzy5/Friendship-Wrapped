import { prisma, type DbClient } from "../../lib/prisma.js";
import { publicUserSelect, userSummarySelect } from "./user.dto.js";

/** How several people appear (e.g. everyone in a group's statistics), in one query. */
export function findUserSummaries(userIds: string[], db: DbClient = prisma) {
  return db.user.findMany({ where: { id: { in: userIds } }, select: userSummarySelect });
}

export function createUser(data: { username: string; displayName: string; passwordHash: string }) {
  return prisma.user.create({ data, select: publicUserSelect });
}

/** The one query that reads the password hash — used only to verify a login. */
export function findUserCredentials(username: string) {
  return prisma.user.findUnique({
    where: { username },
    select: { ...publicUserSelect, passwordHash: true },
  });
}

/** For confirming a sensitive action with the signed-in user's password. */
export function findPasswordHash(id: string) {
  return prisma.user.findUnique({ where: { id }, select: { passwordHash: true } });
}

/** Sessions, reactions, favorites, memberships and invites go with the user (ON DELETE CASCADE). */
export function deleteUser(id: string, db: DbClient = prisma) {
  return db.user.delete({ where: { id }, select: { avatarKey: true } });
}

export function updateUserProfile(id: string, data: { displayName: string }) {
  return prisma.user.update({ where: { id }, data, select: publicUserSelect });
}

export function findAvatarKey(id: string, db: DbClient = prisma) {
  return db.user.findUnique({ where: { id }, select: { avatarKey: true } });
}

export function setAvatarKey(id: string, avatarKey: string | null, db: DbClient = prisma) {
  return db.user.update({ where: { id }, data: { avatarKey }, select: publicUserSelect });
}

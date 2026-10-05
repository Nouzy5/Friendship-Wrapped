import { prisma, type DbClient } from "../../lib/prisma.js";
import { publicUserSelect } from "./user.dto.js";

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

export function updateUserProfile(id: string, data: { displayName: string }) {
  return prisma.user.update({ where: { id }, data, select: publicUserSelect });
}

export function findAvatarKey(id: string, db: DbClient = prisma) {
  return db.user.findUnique({ where: { id }, select: { avatarKey: true } });
}

export function setAvatarKey(id: string, avatarKey: string | null, db: DbClient = prisma) {
  return db.user.update({ where: { id }, data: { avatarKey }, select: publicUserSelect });
}

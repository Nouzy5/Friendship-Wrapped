import { prisma, type DbClient } from "../../lib/prisma.js";
import { publicUserSelect, userSummarySelect } from "./user.dto.js";

/** How several people appear (e.g. everyone in a group's statistics), in one query. */
export function findUserSummaries(userIds: string[], db: DbClient = prisma) {
  return db.user.findMany({ where: { id: { in: userIds } }, select: userSummarySelect });
}

/** A new account's email starts unverified: the address is confirmed by the link sent to it. */
export function createUser(data: { email: string; username: string; displayName: string; passwordHash: string }) {
  return prisma.user.create({ data, select: publicUserSelect });
}

/** The one query that reads the password hash — used only to verify a login. */
export function findUserCredentials(where: { username: string } | { email: string }) {
  return prisma.user.findUnique({
    where,
    select: { ...publicUserSelect, passwordHash: true },
  });
}

/** Which of these an account already has, for saying what was taken when a sign-up collides. */
export async function findTakenIdentifiers(identifiers: { username: string; email: string }) {
  const [username, email] = await Promise.all([
    prisma.user.findUnique({ where: { username: identifiers.username }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: identifiers.email }, select: { id: true } }),
  ]);
  return { username: username !== null, email: email !== null };
}

/** The account as its owner sees it. */
export function findPublicUser(id: string) {
  return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
}

/** The address and what's needed to write to its owner. */
export function findEmailAccount(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, displayName: true, email: true, emailVerifiedAt: true },
  });
}

/** Sets the address and clears the verification: the person has to confirm the new one. */
export function setEmail(id: string, email: string) {
  return prisma.user.update({ where: { id }, data: { email, emailVerifiedAt: null }, select: publicUserSelect });
}

/**
 * Marks the address verified, but only if it's still the one the link was for and wasn't
 * verified already. Returns how many accounts changed.
 */
export async function markEmailVerified(id: string, email: string, at: Date) {
  const { count } = await prisma.user.updateMany({ where: { id, email, emailVerifiedAt: null }, data: { emailVerifiedAt: at } });
  return count;
}

/** For confirming a sensitive action with the signed-in user's password. */
export function findPasswordHash(id: string) {
  return prisma.user.findUnique({ where: { id }, select: { passwordHash: true } });
}

/** Sessions, reactions, favorites, memberships and invites go with the user (ON DELETE CASCADE). */
export function deleteUser(id: string, db: DbClient = prisma) {
  return db.user.delete({ where: { id }, select: { avatarKey: true } });
}

export function updateUserProfile(id: string, data: { displayName?: string; username?: string }) {
  return prisma.user.update({ where: { id }, data, select: publicUserSelect });
}

export function setPasswordHash(id: string, passwordHash: string) {
  return prisma.user.update({ where: { id }, data: { passwordHash }, select: { id: true } });
}

export function findAvatarKey(id: string, db: DbClient = prisma) {
  return db.user.findUnique({ where: { id }, select: { avatarKey: true } });
}

export function setAvatarKey(id: string, avatarKey: string | null, db: DbClient = prisma) {
  return db.user.update({ where: { id }, data: { avatarKey }, select: publicUserSelect });
}

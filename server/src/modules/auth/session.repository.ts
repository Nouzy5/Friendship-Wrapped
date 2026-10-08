import { prisma } from "../../lib/prisma.js";
import { publicUserSelect } from "../users/user.dto.js";

export function createSession(data: { id: string; userId: string; expiresAt: Date; userAgent: string | null }) {
  return prisma.session.create({ data, select: { id: true } });
}

export function findSessionWithUser(id: string) {
  return prisma.session.findUnique({
    where: { id },
    select: { id: true, expiresAt: true, lastActiveAt: true, user: { select: publicUserSelect } },
  });
}

/** updateMany so a session deleted concurrently (e.g. by logout) is a no-op, not an error. */
export function touchSession(id: string, data: { expiresAt?: Date; lastActiveAt?: Date }) {
  return prisma.session.updateMany({ where: { id }, data });
}

export function deleteSession(id: string) {
  return prisma.session.deleteMany({ where: { id } });
}

export function deleteExpiredSessions(userId: string, now: Date) {
  return prisma.session.deleteMany({ where: { userId, expiresAt: { lte: now } } });
}

/** The user's sessions that haven't expired, most recently active first. */
export function listSessions(userId: string, now: Date) {
  return prisma.session.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: [{ lastActiveAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, userAgent: true, createdAt: true, lastActiveAt: true },
  });
}

/** By the public id (a prefix of the stored hash), and only the user's own. */
export function deleteSessionByPublicId(userId: string, publicId: string) {
  return prisma.session.deleteMany({ where: { userId, id: { startsWith: publicId } } });
}

/** Signs the user out everywhere except `keepId`. */
export function deleteOtherSessions(userId: string, keepId: string) {
  return prisma.session.deleteMany({ where: { userId, id: { not: keepId } } });
}

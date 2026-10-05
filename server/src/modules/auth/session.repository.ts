import { prisma } from "../../lib/prisma.js";
import { publicUserSelect } from "../users/user.dto.js";

export function createSession(data: { id: string; userId: string; expiresAt: Date }) {
  return prisma.session.create({ data, select: { id: true } });
}

export function findSessionWithUser(id: string) {
  return prisma.session.findUnique({
    where: { id },
    select: { id: true, expiresAt: true, user: { select: publicUserSelect } },
  });
}

/** updateMany so a session deleted concurrently (e.g. by logout) is a no-op, not an error. */
export function updateSessionExpiry(id: string, expiresAt: Date) {
  return prisma.session.updateMany({ where: { id }, data: { expiresAt } });
}

export function deleteSession(id: string) {
  return prisma.session.deleteMany({ where: { id } });
}

export function deleteExpiredSessions(userId: string, now: Date) {
  return prisma.session.deleteMany({ where: { userId, expiresAt: { lte: now } } });
}

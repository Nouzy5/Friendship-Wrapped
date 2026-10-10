import { prisma } from "../../lib/prisma.js";

/** A new link. Older ones stay valid until `deleteTokensExcept` retires them, once this one has really been sent. */
export function createToken(data: { id: string; userId: string; email: string; expiresAt: Date }) {
  return prisma.emailVerificationToken.create({ data, select: { id: true } });
}

/** Retires every other link the person has: only the newest works. */
export function deleteTokensExcept(userId: string, keepId: string) {
  return prisma.emailVerificationToken.deleteMany({ where: { userId, id: { not: keepId } } });
}

export function deleteToken(id: string) {
  return prisma.emailVerificationToken.deleteMany({ where: { id } });
}

export function findToken(id: string) {
  return prisma.emailVerificationToken.findUnique({
    where: { id },
    select: { userId: true, email: true, expiresAt: true },
  });
}

export function deleteTokensForUser(userId: string) {
  return prisma.emailVerificationToken.deleteMany({ where: { userId } });
}

/** When the person was last sent a link: a new one waits for a cooldown. */
export async function newestTokenTime(userId: string): Promise<Date | null> {
  const newest = await prisma.emailVerificationToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return newest?.createdAt ?? null;
}

/**
 * An address belongs to whoever has confirmed it. An account that only typed it in, and never opened
 * the link, lets go of it when someone else asks for it: otherwise anyone could squat on another
 * person's address (and keep the real owner from ever using it) just by signing up with it. That
 * account is left with no address, and asks for one the next time it's opened.
 */
export function releaseUnconfirmedEmail(email: string) {
  return prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { email } }),
    prisma.user.updateMany({ where: { email, emailVerifiedAt: null }, data: { email: null } }),
  ]);
}

export function deleteExpiredTokens(now: Date) {
  return prisma.emailVerificationToken.deleteMany({ where: { expiresAt: { lte: now } } });
}

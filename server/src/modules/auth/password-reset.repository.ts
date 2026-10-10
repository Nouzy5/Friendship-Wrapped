import { prisma } from "../../lib/prisma.js";

/** A new link. Earlier ones keep working: someone else asking for a link mustn't cancel the one you were sent. */
export function createToken(data: { id: string; userId: string; email: string; expiresAt: Date }) {
  return prisma.passwordResetToken.create({ data, select: { id: true } });
}

export function deleteToken(id: string) {
  return prisma.passwordResetToken.deleteMany({ where: { id } });
}

export function findToken(id: string) {
  return prisma.passwordResetToken.findUnique({
    where: { id },
    select: { userId: true, email: true, expiresAt: true },
  });
}

export function deleteTokensForUser(userId: string) {
  return prisma.passwordResetToken.deleteMany({ where: { userId } });
}

/** When the person was last sent a link: the next one waits for a cooldown. */
export async function newestTokenTime(userId: string): Promise<Date | null> {
  const newest = await prisma.passwordResetToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return newest?.createdAt ?? null;
}

export function deleteExpiredTokens(now: Date) {
  return prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lte: now } } });
}

/**
 * Spends the link and sets the password, all or nothing. Returns false when the link was already
 * spent (a second tap, or two at once: the row can be deleted only once), has expired, or is for an
 * address the account no longer has.
 *
 * Opening the link proved the person reads the mail sent to that address, so the address counts as
 * confirmed. Every session ends: whoever might have known the old password is out, and so is anyone
 * who got in with it. The person signs in again with the new one.
 */
export function spendToken(data: {
  tokenId: string;
  userId: string;
  email: string;
  passwordHash: string;
  now: Date;
}): Promise<boolean> {
  const { tokenId, userId, email, passwordHash, now } = data;
  return prisma.$transaction(async (tx) => {
    const spent = await tx.passwordResetToken.deleteMany({ where: { id: tokenId, expiresAt: { gt: now } } });
    if (spent.count === 0) return false;

    const changed = await tx.user.updateMany({ where: { id: userId, email }, data: { passwordHash } });
    if (changed.count === 0) return false;

    await tx.user.updateMany({ where: { id: userId, email, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.emailVerificationToken.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    return true;
  });
}

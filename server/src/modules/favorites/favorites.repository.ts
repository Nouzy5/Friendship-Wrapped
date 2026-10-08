import { isUniqueConstraintError, prisma, type DbClient } from "../../lib/prisma.js";

/**
 * Idempotent: favoriting twice keeps the original time. Not an upsert: on MySQL, Prisma's
 * upsert is a read then a write, so two requests at once (a double tap) both try to insert.
 */
export async function addFavorite(userId: string, photoId: string, db: DbClient = prisma): Promise<void> {
  try {
    await db.favorite.create({ data: { userId, photoId } });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error; // already a favorite
  }
}

export function removeFavorite(userId: string, photoId: string, db: DbClient = prisma) {
  return db.favorite.deleteMany({ where: { userId, photoId } });
}

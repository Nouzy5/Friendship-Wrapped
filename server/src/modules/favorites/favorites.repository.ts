import { prisma, type DbClient } from "../../lib/prisma.js";

/** Idempotent: favoriting twice keeps the original time. */
export function addFavorite(userId: string, photoId: string, db: DbClient = prisma) {
  return db.favorite.upsert({
    where: { userId_photoId: { userId, photoId } },
    create: { userId, photoId },
    update: {},
  });
}

export function removeFavorite(userId: string, photoId: string, db: DbClient = prisma) {
  return db.favorite.deleteMany({ where: { userId, photoId } });
}

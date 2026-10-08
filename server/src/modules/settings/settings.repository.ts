import type { Prisma } from "../../generated/prisma/client.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { settingsSelect } from "./settings.dto.js";

export function findSettings(userId: string, db: DbClient = prisma) {
  return db.userSettings.findUnique({ where: { userId }, select: settingsSelect });
}

/** The row is created on the first change; until then every setting is its default. */
export function upsertSettings(
  userId: string,
  data: Omit<Prisma.UserSettingsUncheckedCreateInput, "userId">,
  db: DbClient = prisma,
) {
  return db.userSettings.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: settingsSelect,
  });
}

/** Which of these people chose to be left out of Wrapped. */
export async function findHiddenFromWrapped(userIds: string[], db: DbClient = prisma): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.userSettings.findMany({
    where: { userId: { in: userIds }, showInWrapped: false },
    select: { userId: true },
  });
  return new Set(rows.map((row) => row.userId));
}

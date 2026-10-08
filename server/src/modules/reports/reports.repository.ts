import { prisma, type DbClient } from "../../lib/prisma.js";

export function createReport(
  data: { reporterId: string; photoId: string | null; reportedUserId: string | null; message: string },
  db: DbClient = prisma,
) {
  return db.report.create({ data, select: { id: true, createdAt: true } });
}

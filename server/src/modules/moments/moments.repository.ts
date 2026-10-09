import { Prisma } from "../../generated/prisma/client.js";
import { before, type Cursor } from "../../lib/pagination.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { notBlockedWith } from "../blocks/blocks.repository.js";
import { momentSelect } from "./moment.dto.js";

/** Newest first: the one happening now, then the past ones. */
export function listMoments(groupId: string, { cursor, take }: { cursor?: Cursor; take: number }, db: DbClient = prisma) {
  return db.moment.findMany({
    where: { groupId, ...(cursor && before(cursor)) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: momentSelect,
  });
}

export function findMoment(momentId: string, db: DbClient = prisma) {
  return db.moment.findUnique({ where: { id: momentId }, select: momentSelect });
}

/** The group's moment that is still taking photos, if any (at most one is). */
export function findOpenMoment(groupId: string, now: Date, db: DbClient = prisma) {
  return db.moment.findFirst({
    where: { groupId, endsAt: { gt: now } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: momentSelect,
  });
}

export function createMoment(
  data: { groupId: string; createdById: string; title: string; emoji: string | null; endsAt: Date },
  db: DbClient = prisma,
) {
  return db.moment.create({ data, select: momentSelect });
}

/** Closes a moment now. updateMany, so one already closed (or deleted) is left as it is. */
export function endMoment(momentId: string, now: Date, db: DbClient = prisma) {
  return db.moment.updateMany({ where: { id: momentId, endsAt: { gt: now } }, data: { endsAt: now } });
}

/** The moment's photos stay in the group; only the moment goes (`photos.moment_id` becomes NULL). */
export function deleteMoment(momentId: string, db: DbClient = prisma) {
  return db.moment.deleteMany({ where: { id: momentId } });
}

/** Photo counts per moment as the viewer sees them, in one grouped query (empty moments are absent). */
export async function countPhotos(
  momentIds: string[],
  viewerId: string,
  db: DbClient = prisma,
): Promise<Map<string, number>> {
  if (momentIds.length === 0) return new Map();
  const rows = await db.photo.groupBy({
    by: ["momentId"],
    where: { momentId: { in: momentIds }, uploader: notBlockedWith(viewerId) },
    _count: { _all: true },
  });
  return new Map(rows.flatMap((row) => (row.momentId ? [[row.momentId, row._count._all] as const] : [])));
}

/**
 * Each moment's cover: its newest photo that the viewer can see. One lookup per moment on
 * (moment_id, created_at, id).
 */
export async function findCoverPhotoIds(
  momentIds: string[],
  viewerId: string,
  db: DbClient = prisma,
): Promise<Map<string, string>> {
  if (momentIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ moment_id: string; photo_id: string | null }[]>`
    SELECT m.id AS moment_id,
           (SELECT p.id FROM photos p
            WHERE p.moment_id = m.id
              AND NOT EXISTS (
                SELECT 1 FROM blocks b
                WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = p.uploader_id)
                   OR (b.blocker_id = p.uploader_id AND b.blocked_id = ${viewerId}))
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT 1) AS photo_id
    FROM moments m
    WHERE m.id IN (${Prisma.join(momentIds)})`;
  return new Map(rows.flatMap((row) => (row.photo_id ? [[row.moment_id, row.photo_id] as const] : [])));
}

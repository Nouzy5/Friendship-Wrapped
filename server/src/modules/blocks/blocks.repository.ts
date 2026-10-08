import type { Prisma } from "../../generated/prisma/client.js";
import { prisma, type DbClient } from "../../lib/prisma.js";
import { userSummarySelect } from "../users/user.dto.js";

/**
 * People with no block between them and the viewer, in either direction: whose photos,
 * comments and reactions the viewer sees. Put it on a relation to a user, e.g.
 * `{ uploader: notBlockedWith(viewerId) }`.
 */
export function notBlockedWith(viewerId: string) {
  return {
    blocksMade: { none: { blockedId: viewerId } },
    blocksReceived: { none: { blockerId: viewerId } },
  } satisfies Prisma.UserWhereInput;
}

/** Everyone the user has blocked, most recent first. */
export function listBlocked(blockerId: string, db: DbClient = prisma) {
  return db.block.findMany({
    where: { blockerId },
    orderBy: { createdAt: "desc" },
    select: { blocked: { select: userSummarySelect } },
  });
}

/** Blocking someone again is a no-op. */
export function addBlock(blockerId: string, blockedId: string, db: DbClient = prisma) {
  return db.block.createMany({ data: [{ blockerId, blockedId }], skipDuplicates: true });
}

export function removeBlock(blockerId: string, blockedId: string, db: DbClient = prisma) {
  return db.block.deleteMany({ where: { blockerId, blockedId } });
}

/** Everyone with a block (either way) between them and any of these people. */
export async function findBlockedWith(userIds: string[], db: DbClient = prisma): Promise<Set<string>> {
  const rows = await db.block.findMany({
    where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const { blockerId, blockedId } of rows) {
    if (userIds.includes(blockerId)) ids.add(blockedId);
    if (userIds.includes(blockedId)) ids.add(blockerId);
  }
  return ids;
}

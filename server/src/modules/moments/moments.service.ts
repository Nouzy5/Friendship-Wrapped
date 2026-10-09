import type { GroupRole } from "../../generated/prisma/client.js";
import { AppError, forbidden, notFound } from "../../lib/errors.js";
import { toPage, type Cursor } from "../../lib/pagination.js";
import { withTransaction } from "../../lib/prisma.js";
import * as groupsRepository from "../groups/groups.repository.js";
import { requireMembership } from "../groups/groups.service.js";
import * as notifications from "../notifications/notifications.service.js";
import { listMomentPhotos } from "../photos/photos.service.js";
import { toMomentView, type MomentRow, type MomentView } from "./moment.dto.js";
import * as momentsRepository from "./moments.repository.js";
import type { CreateMomentInput } from "./moments.schemas.js";

const HOUR_MS = 60 * 60 * 1000;

/** Ending and deleting a moment are for its creator and the group owner, like albums. */
function canManage(moment: MomentRow, userId: string, role: GroupRole): boolean {
  return moment.createdById === userId || role === "OWNER";
}

async function toViews(moments: MomentRow[], userId: string, role: GroupRole, now = new Date()): Promise<MomentView[]> {
  const ids = moments.map((moment) => moment.id);
  const [counts, covers] = await Promise.all([
    momentsRepository.countPhotos(ids, userId),
    momentsRepository.findCoverPhotoIds(ids, userId),
  ]);
  return moments.map((moment) =>
    toMomentView(moment, {
      photoCount: counts.get(moment.id) ?? 0,
      coverPhotoId: covers.get(moment.id),
      canManage: canManage(moment, userId, role),
      now,
    }),
  );
}

async function viewOf(moment: MomentRow, userId: string, role: GroupRole): Promise<MomentView> {
  const [view] = await toViews([moment], userId, role);
  return view!;
}

/** The moment and the user's role in its group. Non-members get 404, like for groups. */
async function requireMoment(momentId: string, userId: string) {
  const moment = await momentsRepository.findMoment(momentId);
  const membership = moment && (await groupsRepository.findMembership(moment.groupId, userId));
  if (!moment || !membership) throw notFound("Moment not found");
  return { moment, role: membership.role };
}

/** Newest first, the one happening now at the top. */
export async function listMoments(groupId: string, userId: string, { cursor, limit }: { cursor?: Cursor; limit: number }) {
  const { role } = await requireMembership(groupId, userId);
  const rows = await momentsRepository.listMoments(groupId, { cursor, take: limit + 1 });
  const { items, nextCursor } = toPage(rows, limit);
  return { moments: await toViews(items, userId, role), nextCursor };
}

/** The moment taking photos now, or null. */
export async function getOpenMoment(groupId: string, userId: string): Promise<MomentView | null> {
  const { role } = await requireMembership(groupId, userId);
  const moment = await momentsRepository.findOpenMoment(groupId, new Date());
  return moment ? viewOf(moment, userId, role) : null;
}

/**
 * Starts a moment. A group has one open at a time (409 while there is one), checked and
 * written together so two people starting at once can't both succeed. Everyone else in the
 * group hears about it, if they asked to.
 */
export async function createMoment(groupId: string, userId: string, input: CreateMomentInput): Promise<MomentView> {
  const { moment, role } = await withTransaction(async (tx) => {
    const { role } = await requireMembership(groupId, userId, tx);
    const now = new Date();
    const open = await momentsRepository.findOpenMoment(groupId, now, tx);
    if (open) {
      throw new AppError(409, "MOMENT_ALREADY_OPEN", "A moment is already happening in this group", { momentId: open.id });
    }
    const moment = await momentsRepository.createMoment(
      {
        groupId,
        createdById: userId,
        title: input.title,
        emoji: input.emoji ?? null,
        endsAt: new Date(now.getTime() + input.durationHours * HOUR_MS),
      },
      tx,
    );
    return { moment, role };
  });

  notifications.momentStarted(moment.id, groupId, userId, { title: moment.title, emoji: moment.emoji });
  return viewOf(moment, userId, role);
}

export async function getMoment(momentId: string, userId: string): Promise<MomentView> {
  const { moment, role } = await requireMoment(momentId, userId);
  return viewOf(moment, userId, role);
}

/** Closes it to new photos now. Ending one that has already ended changes nothing. */
export async function endMoment(momentId: string, userId: string): Promise<MomentView> {
  const { moment, role } = await requireMoment(momentId, userId);
  if (!canManage(moment, userId, role)) throw forbidden("Only the moment's creator or the group owner can end it");
  await momentsRepository.endMoment(momentId, new Date());
  const ended = await momentsRepository.findMoment(momentId);
  if (!ended) throw notFound("Moment not found"); // deleted a moment ago
  return viewOf(ended, userId, role);
}

/** The photos stay in the group; only the moment goes. */
export async function deleteMoment(momentId: string, userId: string): Promise<void> {
  const { moment, role } = await requireMoment(momentId, userId);
  if (!canManage(moment, userId, role)) throw forbidden("Only the moment's creator or the group owner can delete it");
  await momentsRepository.deleteMoment(momentId);
}

/** Oldest first, so a moment reads like how it went. */
export async function listPhotos(momentId: string, userId: string, page: { cursor?: Cursor; limit: number }) {
  await requireMoment(momentId, userId);
  return listMomentPhotos(momentId, userId, page);
}

import type { Prisma } from "../../generated/prisma/client.js";
import { photoImageUrl } from "../photos/photo.dto.js";
import { toUserSummary, userSummarySelect, type UserSummary } from "../users/user.dto.js";

export const momentSelect = {
  id: true,
  groupId: true,
  title: true,
  emoji: true,
  createdAt: true,
  endsAt: true,
  createdById: true,
  createdBy: { select: userSummarySelect },
} satisfies Prisma.MomentSelect;

export type MomentRow = Prisma.MomentGetPayload<{ select: typeof momentSelect }>;

export type MomentView = {
  id: string;
  groupId: string;
  title: string;
  /** One emoji, or null. */
  emoji: string | null;
  /** When it started. */
  startsAt: Date;
  /** When it closes to new photos (or closed, if that is in the past). */
  endsAt: Date;
  /** Still taking photos right now. */
  isOpen: boolean;
  /** Null once the creator's account is gone. */
  createdBy: UserSummary | null;
  /** The photos posted into it that the viewer can see. */
  photoCount: number;
  /** The newest photo in it, as a thumbnail. */
  cover: { photoId: string; thumbnailUrl: string } | null;
  /** Ending and deleting it are for its creator and the group owner. */
  canManage: boolean;
};

export function toMomentView(
  moment: MomentRow,
  { photoCount, coverPhotoId, canManage, now }: { photoCount: number; coverPhotoId: string | undefined; canManage: boolean; now: Date },
): MomentView {
  return {
    id: moment.id,
    groupId: moment.groupId,
    title: moment.title,
    emoji: moment.emoji,
    startsAt: moment.createdAt,
    endsAt: moment.endsAt,
    isOpen: moment.endsAt.getTime() > now.getTime(),
    createdBy: moment.createdBy && toUserSummary(moment.createdBy),
    photoCount,
    cover: coverPhotoId ? { photoId: coverPhotoId, thumbnailUrl: photoImageUrl(coverPhotoId, "thumbnail") } : null,
    canManage,
  };
}

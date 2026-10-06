import type { Prisma } from "../../generated/prisma/client.js";
import { apiPath } from "../../lib/api-path.js";
import type { PhotoVariant } from "../../lib/images.js";
import { toReactionSummary, type ReactionCounts, type ReactionSummary } from "../reactions/reaction.dto.js";
import { toUserSummary, userSummarySelect, type UserSummary } from "../users/user.dto.js";

/** What a photo looks like to one viewer: their own reaction and favorite ride along (at most one row each). */
export function photoSelect(viewerId: string) {
  return {
    id: true,
    groupId: true,
    caption: true,
    width: true,
    height: true,
    createdAt: true,
    uploader: { select: userSummarySelect },
    reactions: { where: { userId: viewerId }, select: { type: true } },
    favorites: { where: { userId: viewerId }, select: { userId: true } },
  } satisfies Prisma.PhotoSelect;
}

export function photoDetailSelect(viewerId: string) {
  return {
    ...photoSelect(viewerId),
    group: { select: { id: true, name: true, emoji: true } },
  } satisfies Prisma.PhotoSelect;
}

export type PhotoRow = Prisma.PhotoGetPayload<{ select: ReturnType<typeof photoSelect> }>;
type PhotoDetailRow = Prisma.PhotoGetPayload<{ select: ReturnType<typeof photoDetailSelect> }>;

export type PhotoView = {
  id: string;
  groupId: string;
  caption: string | null;
  /** Pixel size of the full rendition, so clients can reserve space before it loads. */
  width: number;
  height: number;
  /** Upload time. */
  createdAt: Date;
  uploader: UserSummary;
  /** Every rendition is served through the API, which checks access on each request. */
  imageUrls: Record<PhotoVariant, string>;
  /** Only the uploader may delete a photo. */
  canDelete: boolean;
  /** Reacting and commenting are for current members of the photo's group. */
  canInteract: boolean;
  reactions: ReactionSummary;
  commentCount: number;
  /** The viewer's private bookmark. */
  isFavorite: boolean;
};

/** The photos either side of this one in its group feed, for swiping through the viewer. */
export type FeedNeighbors = { newerId: string | null; olderId: string | null };

export type PhotoDetailView = PhotoView & {
  group: { id: string; name: string; emoji: string };
  /** Null for a viewer who can see the photo but not its group (an uploader who has left). */
  feed: FeedNeighbors | null;
};

export function photoImageUrl(photoId: string, variant: PhotoVariant): string {
  return apiPath(`/photos/${photoId}/images/${variant}`);
}

function imageUrls(photoId: string): Record<PhotoVariant, string> {
  const url = (variant: PhotoVariant) => photoImageUrl(photoId, variant);
  return { full: url("full"), medium: url("medium"), thumbnail: url("thumbnail") };
}

/** Who's looking, and the counts loaded alongside the rows (see `photos.service`). */
export type ViewContext = {
  viewerId: string;
  canInteract: boolean;
  /** Undefined when nobody has reacted. */
  reactionCounts: ReactionCounts | undefined;
  commentCount: number;
};

export function toPhotoView(
  photo: PhotoRow,
  { viewerId, canInteract, reactionCounts, commentCount }: ViewContext,
): PhotoView {
  return {
    id: photo.id,
    groupId: photo.groupId,
    caption: photo.caption,
    width: photo.width,
    height: photo.height,
    createdAt: photo.createdAt,
    uploader: toUserSummary(photo.uploader),
    imageUrls: imageUrls(photo.id),
    canDelete: photo.uploader.id === viewerId,
    canInteract,
    reactions: toReactionSummary(reactionCounts, photo.reactions[0]?.type ?? null),
    commentCount,
    isFavorite: photo.favorites.length > 0,
  };
}

export function toPhotoDetailView(
  photo: PhotoDetailRow,
  context: ViewContext,
  feed: FeedNeighbors | null,
): PhotoDetailView {
  return { ...toPhotoView(photo, context), group: photo.group, feed };
}

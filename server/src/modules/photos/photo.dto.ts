import type { Prisma } from "../../generated/prisma/client.js";
import { apiPath } from "../../lib/api-path.js";
import type { PhotoVariant } from "../../lib/images.js";
import { toUserSummary, userSummarySelect, type UserSummary } from "../users/user.dto.js";

export const photoSelect = {
  id: true,
  groupId: true,
  caption: true,
  width: true,
  height: true,
  createdAt: true,
  uploader: { select: userSummarySelect },
} satisfies Prisma.PhotoSelect;

export const photoDetailSelect = {
  ...photoSelect,
  group: { select: { id: true, name: true, emoji: true } },
} satisfies Prisma.PhotoSelect;

type PhotoRow = Prisma.PhotoGetPayload<{ select: typeof photoSelect }>;
type PhotoDetailRow = Prisma.PhotoGetPayload<{ select: typeof photoDetailSelect }>;

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
};

export type PhotoDetailView = PhotoView & { group: { id: string; name: string; emoji: string } };

function imageUrls(photoId: string): Record<PhotoVariant, string> {
  const url = (variant: PhotoVariant) => apiPath(`/photos/${photoId}/images/${variant}`);
  return { full: url("full"), medium: url("medium"), thumbnail: url("thumbnail") };
}

export function toPhotoView(photo: PhotoRow, viewerId: string): PhotoView {
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
  };
}

export function toPhotoDetailView(photo: PhotoDetailRow, viewerId: string): PhotoDetailView {
  return { ...toPhotoView(photo, viewerId), group: photo.group };
}

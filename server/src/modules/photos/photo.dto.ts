import type { Prisma } from "../../generated/prisma/client.js";
import { apiPath } from "../../lib/api-path.js";
import type { PhotoVariant } from "../../lib/images.js";
import { toReactionSummary, type ReactionSummary, type Reactor } from "../reactions/reaction.dto.js";
import { toUserSummary, userSummarySelect, type UserSummary } from "../users/user.dto.js";

/** What a photo looks like to one viewer: their own reaction and favorite ride along (at most one row each). */
export function photoSelect(viewerId: string) {
  return {
    id: true,
    groupId: true,
    momentId: true,
    kind: true,
    videoDurationMs: true,
    videoSizeBytes: true,
    videoIsLive: true,
    caption: true,
    width: true,
    height: true,
    createdAt: true,
    // The uploader's saving setting rides along for `canSave`; it never reaches the client as such.
    uploader: { select: { ...userSummarySelect, settings: { select: { allowPhotoSaving: true } } } },
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
  /** The moment it was posted into, if any. */
  momentId: string | null;
  /** A video is still a post like any other: its three images below are its poster frame. */
  kind: "photo" | "video";
  /** Set for a video only. */
  video: VideoView | null;
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
  /** Whether the viewer may download it: always their own, otherwise as the uploader allows. */
  canSave: boolean;
  /** Reacting and commenting are for current members of the photo's group. */
  canInteract: boolean;
  reactions: ReactionSummary;
  commentCount: number;
  /** The viewer's private bookmark. */
  isFavorite: boolean;
};

/** How to play a video post. The file is served through the API like the images, with `Range` support. */
export type VideoView = {
  /** Access-checked, like the images. */
  url: string;
  durationMs: number;
  sizeBytes: number;
  /** A Live Photo's motion: plays by itself, muted and looping. */
  isLive: boolean;
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

export function photoVideoUrl(photoId: string): string {
  return apiPath(`/photos/${photoId}/video`);
}

function imageUrls(photoId: string): Record<PhotoVariant, string> {
  const url = (variant: PhotoVariant) => photoImageUrl(photoId, variant);
  return { full: url("full"), medium: url("medium"), thumbnail: url("thumbnail") };
}

/** Saving is on unless the uploader turned it off; their own photos they can always save. */
export function canSavePhoto(uploader: { id: string; settings: { allowPhotoSaving: boolean } | null }, viewerId: string) {
  return uploader.id === viewerId || (uploader.settings?.allowPhotoSaving ?? true);
}

/** Who's looking, and the reactions and counts loaded alongside the rows (see `photos.service`). */
export type ViewContext = {
  viewerId: string;
  canInteract: boolean;
  /** Undefined when nobody has reacted. */
  reactors: Reactor[] | undefined;
  commentCount: number;
};

export function toPhotoView(
  photo: PhotoRow,
  { viewerId, canInteract, reactors, commentCount }: ViewContext,
): PhotoView {
  const { settings: _settings, ...uploader } = photo.uploader;
  return {
    id: photo.id,
    groupId: photo.groupId,
    momentId: photo.momentId,
    kind: photo.kind === "VIDEO" ? "video" : "photo",
    video:
      photo.kind === "VIDEO"
        ? {
            url: photoVideoUrl(photo.id),
            durationMs: photo.videoDurationMs ?? 0,
            sizeBytes: photo.videoSizeBytes ?? 0,
            isLive: photo.videoIsLive,
          }
        : null,
    caption: photo.caption,
    width: photo.width,
    height: photo.height,
    createdAt: photo.createdAt,
    uploader: toUserSummary(uploader),
    imageUrls: imageUrls(photo.id),
    canDelete: photo.uploader.id === viewerId,
    canSave: canSavePhoto(photo.uploader, viewerId),
    canInteract,
    reactions: toReactionSummary(reactors, photo.reactions[0]?.type ?? null),
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

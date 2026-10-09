import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { parseRange, type ByteRange } from "../../lib/http-range.js";
import { IMAGE_CONTENT_TYPE, PHOTO_VARIANTS, processPhoto, type PhotoVariant } from "../../lib/images.js";
import { logger } from "../../lib/logger.js";
import { toPage, type Cursor } from "../../lib/pagination.js";
import { withTransaction } from "../../lib/prisma.js";
import * as storage from "../../lib/storage.js";
import { dayRangeIn, isoDate, isRealDate, todayIn } from "../../lib/time-zone.js";
import { getGroup, isMember, requireMembership } from "../groups/groups.service.js";
import * as commentsRepository from "../comments/comments.repository.js";
import * as notifications from "../notifications/notifications.service.js";
import * as reactionsRepository from "../reactions/reactions.repository.js";
import { requireOpenMomentIn } from "../moments/moment-guard.js";
import { newPhotoKeys } from "./photo-keys.js";
import { prepareVideo } from "./video-post.js";
import {
  canSavePhoto,
  toPhotoDetailView,
  toPhotoView,
  type PhotoDetailView,
  type PhotoRow,
  type PhotoView,
  type ViewContext,
} from "./photo.dto.js";
import * as photosRepository from "./photos.repository.js";
import type { ListPhotosQuery, OnThisDayQuery } from "./photos.schemas.js";

const VARIANTS = Object.keys(PHOTO_VARIANTS) as PhotoVariant[];

/**
 * Who reacted and how many comments, for a set of photos as the viewer sees them: one query
 * each, on indexed photo_id.
 */
async function loadCounts(photoIds: string[], viewerId: string) {
  const [reactors, comments] = await Promise.all([
    reactionsRepository.listReactorsByPhoto(photoIds, viewerId),
    commentsRepository.countByPhoto(photoIds, viewerId),
  ]);
  return (photoId: string): Pick<ViewContext, "reactors" | "commentCount"> => ({
    reactors: reactors.get(photoId),
    commentCount: comments.get(photoId) ?? 0,
  });
}

/** Views for photos listed to a member (so they can join in). */
async function toViews(rows: PhotoRow[], viewerId: string): Promise<PhotoView[]> {
  const countsOf = await loadCounts(
    rows.map((photo) => photo.id),
    viewerId,
  );
  return rows.map((photo) => toPhotoView(photo, { viewerId, canInteract: true, ...countsOf(photo.id) }));
}

type PhotoPage = { photos: PhotoView[]; nextCursor: string | null };

async function toPageOfViews(rows: PhotoRow[], limit: number, viewerId: string): Promise<PhotoPage> {
  const { items, nextCursor } = toPage(rows, limit);
  return { photos: await toViews(items, viewerId), nextCursor };
}

/** Only members can post to a group. Checked before the upload body is even read. */
export async function assertCanPost(groupId: string, userId: string): Promise<void> {
  await requireMembership(groupId, userId);
}

/** A video sent with a post: in a temporary file the caller removes afterwards. */
export type VideoUpload = { path: string; size: number; /** From a Live Photo. */ isLive: boolean };

/**
 * Validates and processes the image (or, for a video, converts it and takes its poster frame),
 * stores the renditions, then records the post. A video is a post like any other: its three
 * images are its poster, so everything that works with photos works with it. If anything fails
 * after the upload, the stored files are removed again.
 */
export async function createPhoto(
  groupId: string,
  uploaderId: string,
  image: Buffer | undefined,
  caption: string | null,
  momentId: string | null = null,
  video?: VideoUpload,
): Promise<PhotoView> {
  if (!image && !video) throw badRequest("Choose a photo or video to upload");
  // Refused before the file is processed. Checked again below, in the same transaction as the write.
  if (momentId) await requireOpenMomentIn(groupId, momentId);

  // `image` is the still sent with a video, if any: the video's poster.
  const prepared = video ? await prepareVideo(video, image) : null;
  try {
    const renditions = prepared ? prepared.renditions : await processPhoto(image!);
    const keys = newPhotoKeys(groupId);

    try {
      await Promise.all([
        ...VARIANTS.map((variant) => storage.putObject(keys[variant], renditions[variant].data, IMAGE_CONTENT_TYPE)),
        ...(prepared ? [storage.putObjectFromFile(keys.video, prepared.file, prepared.sizeBytes, "video/mp4")] : []),
      ]);

      const photo = await withTransaction(async (tx) => {
        // Re-checked: the uploader may have left or been removed while the file was processing.
        await requireMembership(groupId, uploaderId, tx);
        // It may have closed while the file was processing.
        if (momentId) await requireOpenMomentIn(groupId, momentId, tx);
        return photosRepository.createPhoto(
          {
            groupId,
            uploaderId,
            momentId,
            caption,
            storageKey: keys.full,
            mediumKey: keys.medium,
            thumbnailKey: keys.thumbnail,
            width: renditions.full.width,
            height: renditions.full.height,
            sizeBytes: renditions.full.data.length,
            ...(prepared &&
              video && {
                kind: "VIDEO" as const,
                videoKey: keys.video,
                videoDurationMs: prepared.durationMs,
                videoSizeBytes: prepared.sizeBytes,
                videoIsLive: video.isLive,
              }),
          },
          tx,
        );
      });

      notifications.photoPosted(photo.id, groupId, uploaderId, prepared ? "video" : "photo");
      return toPhotoView(photo, { viewerId: uploaderId, canInteract: true, reactors: undefined, commentCount: 0 });
    } catch (error) {
      await storage.discardObjects(Object.values(keys));
      throw error;
    }
  } finally {
    await prepared?.discard();
  }
}

/** Newest first: the feed, the timeline (optionally from a given point), your favorites, and one person's photos. */
export async function listGroupPhotos(
  groupId: string,
  viewerId: string,
  { cursor, limit, before, favorites, uploaderId }: ListPhotosQuery,
): Promise<PhotoPage> {
  await requireMembership(groupId, viewerId);
  const rows = await photosRepository.listGroupPhotos(groupId, viewerId, {
    cursor,
    startBefore: before,
    onlyFavorites: favorites,
    uploaderId,
    take: limit + 1,
  });
  return toPageOfViews(rows, limit, viewerId);
}

/**
 * Views of specific photos of a group, in the order of `photoIds` (ids not in the group
 * are left out). Callers check the viewer is a member first.
 */
export async function listGroupPhotosByIds(groupId: string, photoIds: string[], viewerId: string): Promise<PhotoView[]> {
  if (photoIds.length === 0) return [];
  const rows = await photosRepository.findGroupPhotosByIds(groupId, photoIds, viewerId);
  const views = new Map((await toViews(rows, viewerId)).map((view) => [view.id, view]));
  return photoIds.flatMap((id) => views.get(id) ?? []);
}

/** Oldest first. Callers check access to the album (and so its group) first. */
export async function listAlbumPhotos(
  albumId: string,
  viewerId: string,
  { cursor, limit }: { cursor?: Cursor; limit: number },
): Promise<PhotoPage> {
  const rows = await photosRepository.listAlbumPhotos(albumId, viewerId, { cursor, take: limit + 1 });
  return toPageOfViews(rows, limit, viewerId);
}

/** A moment's photos, oldest first. Callers check access to the moment (and so its group) first. */
export async function listMomentPhotos(
  momentId: string,
  viewerId: string,
  { cursor, limit }: { cursor?: Cursor; limit: number },
): Promise<PhotoPage> {
  const rows = await photosRepository.listMomentPhotos(momentId, viewerId, { cursor, take: limit + 1 });
  return toPageOfViews(rows, limit, viewerId);
}

/** At most this many photos from each earlier year, so one busy year can't crowd out the rest. */
const ON_THIS_DAY_PER_YEAR = 50;

/**
 * Photos from the same calendar day in earlier years, newest year first. Days are the
 * viewer's own (their time zone), and only years since the group began are searched.
 */
export async function listOnThisDay(
  groupId: string,
  viewerId: string,
  { tz, date }: OnThisDayQuery,
): Promise<{ date: string; years: { year: number; photos: PhotoView[] }[] }> {
  const group = await getGroup(groupId, viewerId);
  const today = date ?? todayIn(tz);
  const firstYear = todayIn(tz, group.createdAt).year;
  // A far-future `date` mustn't mean thousands of empty years: nothing is posted after this one.
  const lastYear = Math.min(today.year - 1, todayIn(tz).year);

  const ranges = [];
  for (let year = lastYear; year >= firstYear; year--) {
    const day = { ...today, year };
    // 29 February only comes back in leap years.
    if (isRealDate(day)) ranges.push({ year, ...dayRangeIn(day, tz) });
  }
  if (ranges.length === 0) return { date: isoDate(today), years: [] };

  const perYear = await Promise.all(
    ranges.map((range) => photosRepository.listPhotosInRange(groupId, viewerId, range, ON_THIS_DAY_PER_YEAR)),
  );
  const views = await toViews(perYear.flat(), viewerId);
  const years = ranges
    .map(({ year, from, to }) => ({
      year,
      photos: views.filter(({ createdAt }) => createdAt >= from && createdAt < to),
    }))
    .filter((entry) => entry.photos.length > 0);
  return { date: isoDate(today), years };
}

/** 404 (never 403) for photos the viewer can't see, so their existence isn't revealed. */
export async function getPhoto(photoId: string, viewerId: string): Promise<PhotoDetailView> {
  const photo = await photosRepository.findVisiblePhoto(photoId, viewerId);
  if (!photo) throw notFound("Photo not found");

  // Only members browse the group feed and join in; an uploader who has left just sees their own photo.
  const member = await isMember(photo.groupId, viewerId);
  const [feed, countsOf] = await Promise.all([
    member ? photosRepository.findFeedNeighbors(photo, viewerId) : null,
    loadCounts([photo.id], viewerId),
  ]);
  return toPhotoDetailView(photo, { viewerId, canInteract: member, ...countsOf(photo.id) }, feed);
}

export async function canSeePhoto(photoId: string, viewerId: string): Promise<boolean> {
  return (await photosRepository.findVisiblePhotoRef(photoId, viewerId)) !== null;
}

/** For features attached to a photo: the photo if the viewer can see it, else 404. */
export async function requireVisiblePhoto(photoId: string, viewerId: string) {
  const photo = await photosRepository.findVisiblePhotoRef(photoId, viewerId);
  if (!photo) throw notFound("Photo not found");
  return photo;
}

/**
 * Reacting and commenting are for current members of the photo's group. Someone who
 * posted a photo and then left can still see it (404 for everyone else), but not join in.
 */
export async function requireMemberAccess(photoId: string, userId: string) {
  const photo = await requireVisiblePhoto(photoId, userId);
  if (!(await isMember(photo.groupId, userId))) throw forbidden("Only members of this group can do that");
  return photo;
}

/**
 * A rendition of a photo. As a download (an attachment named after the day it was posted),
 * only for viewers who may save it: 403 when the uploader turned saving off.
 */
export async function getPhotoImage(
  photoId: string,
  viewerId: string,
  variant: PhotoVariant,
  { download }: { download: boolean } = { download: false },
): Promise<{ image: storage.StoredObject; downloadName: string | undefined }> {
  const photo = await photosRepository.findVisiblePhotoKeys(photoId, viewerId);
  if (!photo) throw notFound("Photo not found");
  if (download && !canSavePhoto(photo.uploader, viewerId)) {
    throw forbidden("The person who posted this photo doesn't allow saving it");
  }

  const key = { full: photo.storageKey, medium: photo.mediumKey, thumbnail: photo.thumbnailKey }[variant];
  const image = await storage.getObject(key);
  if (!image) {
    logger.warn(`Photo ${photoId} has no stored ${variant} image (${key})`);
    throw notFound("Photo not found");
  }
  const downloadName = download ? `friendship-wrapped-${photo.createdAt.toISOString().slice(0, 10)}.webp` : undefined;
  return { image, downloadName };
}

export async function deletePhoto(photoId: string, userId: string): Promise<void> {
  const photo = await photosRepository.findVisiblePhotoKeys(photoId, userId);
  if (!photo) throw notFound("Photo not found");
  if (photo.uploaderId !== userId) throw forbidden("Only the person who posted a photo can delete it");

  await photosRepository.deletePhoto(photoId);
  await storage.discardObjects([
    photo.storageKey,
    photo.mediumKey,
    photo.thumbnailKey,
    ...(photo.videoKey ? [photo.videoKey] : []),
  ]);
}

/**
 * A video post's MP4, or the part of it asked for (`rangeHeader` is the request's `Range`). Only
 * for viewers who can see the post; as a download (an attachment named after the day it was
 * posted) only for those who may save it. A range that starts past the end is `unsatisfiable`.
 */
export async function getPhotoVideo(
  photoId: string,
  viewerId: string,
  { rangeHeader, download }: { rangeHeader: string | undefined; download: boolean },
): Promise<
  | { unsatisfiable: true; size: number }
  | { unsatisfiable: false; video: storage.StoredObject; size: number; range: ByteRange | null; downloadName: string | undefined }
> {
  const photo = await photosRepository.findVisiblePhotoKeys(photoId, viewerId);
  if (!photo || photo.kind !== "VIDEO" || !photo.videoKey || !photo.videoSizeBytes) throw notFound("Video not found");
  if (download && !canSavePhoto(photo.uploader, viewerId)) {
    throw forbidden("The person who posted this video doesn't allow saving it");
  }

  const size = photo.videoSizeBytes;
  const range = parseRange(rangeHeader, size);
  if (range === "unsatisfiable") return { unsatisfiable: true, size };

  const video = await (range ? storage.getObjectRange(photo.videoKey, range) : storage.getObject(photo.videoKey));
  if (!video) {
    logger.warn(`Photo ${photoId} has no stored video (${photo.videoKey})`);
    throw notFound("Video not found");
  }
  const downloadName = download ? `friendship-wrapped-${photo.createdAt.toISOString().slice(0, 10)}.mp4` : undefined;
  return { unsatisfiable: false, video, size, range, downloadName };
}

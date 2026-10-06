import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { IMAGE_CONTENT_TYPE, PHOTO_VARIANTS, processPhoto, type PhotoVariant } from "../../lib/images.js";
import { logger } from "../../lib/logger.js";
import { toPage, type Cursor } from "../../lib/pagination.js";
import { withTransaction } from "../../lib/prisma.js";
import * as storage from "../../lib/storage.js";
import { dayRangeIn, isRealDate, todayIn, type CalendarDate } from "../../lib/time-zone.js";
import { getGroup, isMember, requireMembership } from "../groups/groups.service.js";
import * as commentsRepository from "../comments/comments.repository.js";
import * as reactionsRepository from "../reactions/reactions.repository.js";
import { newPhotoKeys } from "./photo-keys.js";
import {
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

/** Reaction and comment counts for a set of photos: one grouped query each, on indexed photo_id. */
async function loadCounts(photoIds: string[]) {
  const [reactions, comments] = await Promise.all([
    reactionsRepository.countByPhoto(photoIds),
    commentsRepository.countByPhoto(photoIds),
  ]);
  return (photoId: string): Pick<ViewContext, "reactionCounts" | "commentCount"> => ({
    reactionCounts: reactions.get(photoId),
    commentCount: comments.get(photoId) ?? 0,
  });
}

/** Views for photos listed to a member (so they can join in). */
async function toViews(rows: PhotoRow[], viewerId: string): Promise<PhotoView[]> {
  const countsOf = await loadCounts(rows.map((photo) => photo.id));
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

/**
 * Validates and processes the image, stores its renditions, then records the photo.
 * If anything fails after the upload, the stored files are removed again.
 */
export async function createPhoto(
  groupId: string,
  uploaderId: string,
  image: Buffer | undefined,
  caption: string | null,
): Promise<PhotoView> {
  if (!image) throw badRequest("Choose a photo to upload");

  const renditions = await processPhoto(image);
  const keys = newPhotoKeys(groupId);

  try {
    await Promise.all(
      VARIANTS.map((variant) => storage.putObject(keys[variant], renditions[variant].data, IMAGE_CONTENT_TYPE)),
    );

    const photo = await withTransaction(async (tx) => {
      // Re-checked: the uploader may have left or been removed while the image was processing.
      await requireMembership(groupId, uploaderId, tx);
      return photosRepository.createPhoto(
        {
          groupId,
          uploaderId,
          caption,
          storageKey: keys.full,
          mediumKey: keys.medium,
          thumbnailKey: keys.thumbnail,
          width: renditions.full.width,
          height: renditions.full.height,
          sizeBytes: renditions.full.data.length,
        },
        tx,
      );
    });

    return toPhotoView(photo, { viewerId: uploaderId, canInteract: true, reactionCounts: undefined, commentCount: 0 });
  } catch (error) {
    await storage.discardObjects(Object.values(keys));
    throw error;
  }
}

/** Newest first: the feed, the timeline (optionally from a given point) and your favorites. */
export async function listGroupPhotos(
  groupId: string,
  viewerId: string,
  { cursor, limit, before, favorites }: ListPhotosQuery,
): Promise<PhotoPage> {
  await requireMembership(groupId, viewerId);
  const rows = await photosRepository.listGroupPhotos(groupId, viewerId, {
    cursor,
    startBefore: before,
    onlyFavorites: favorites,
    take: limit + 1,
  });
  return toPageOfViews(rows, limit, viewerId);
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

/** At most this many photos for On This Day, across all years. */
const ON_THIS_DAY_LIMIT = 100;

const isoDate = ({ year, month, day }: CalendarDate) =>
  [String(year).padStart(4, "0"), String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");

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

  const ranges = [];
  for (let year = today.year - 1; year >= firstYear; year--) {
    const day = { ...today, year };
    // 29 February only comes back in leap years.
    if (isRealDate(day)) ranges.push({ year, ...dayRangeIn(day, tz) });
  }
  if (ranges.length === 0) return { date: isoDate(today), years: [] };

  const rows = await photosRepository.listPhotosInRanges(groupId, viewerId, ranges, ON_THIS_DAY_LIMIT);
  const photos = await toViews(rows, viewerId);
  const years = ranges
    .map(({ year, from, to }) => ({
      year,
      photos: photos.filter(({ createdAt }) => createdAt >= from && createdAt < to),
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
    member ? photosRepository.findFeedNeighbors(photo) : null,
    loadCounts([photo.id]),
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

export async function getPhotoImage(
  photoId: string,
  viewerId: string,
  variant: PhotoVariant,
): Promise<storage.StoredObject> {
  const photo = await photosRepository.findVisiblePhotoKeys(photoId, viewerId);
  if (!photo) throw notFound("Photo not found");

  const key = { full: photo.storageKey, medium: photo.mediumKey, thumbnail: photo.thumbnailKey }[variant];
  const image = await storage.getObject(key);
  if (!image) {
    logger.warn(`Photo ${photoId} has no stored ${variant} image (${key})`);
    throw notFound("Photo not found");
  }
  return image;
}

export async function deletePhoto(photoId: string, userId: string): Promise<void> {
  const photo = await photosRepository.findVisiblePhotoKeys(photoId, userId);
  if (!photo) throw notFound("Photo not found");
  if (photo.uploaderId !== userId) throw forbidden("Only the person who posted a photo can delete it");

  await photosRepository.deletePhoto(photoId);
  await storage.discardObjects([photo.storageKey, photo.mediumKey, photo.thumbnailKey]);
}

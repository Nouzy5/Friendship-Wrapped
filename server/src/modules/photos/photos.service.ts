import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { IMAGE_CONTENT_TYPE, PHOTO_VARIANTS, processPhoto, type PhotoVariant } from "../../lib/images.js";
import { logger } from "../../lib/logger.js";
import { withTransaction } from "../../lib/prisma.js";
import * as storage from "../../lib/storage.js";
import { requireMembership } from "../groups/groups.service.js";
import { newPhotoKeys } from "./photo-keys.js";
import { toPhotoDetailView, toPhotoView, type PhotoDetailView, type PhotoView } from "./photo.dto.js";
import * as photosRepository from "./photos.repository.js";
import { encodePhotoCursor, type ListPhotosQuery } from "./photos.schemas.js";

const VARIANTS = Object.keys(PHOTO_VARIANTS) as PhotoVariant[];

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

    return toPhotoView(photo, uploaderId);
  } catch (error) {
    await storage.discardObjects(Object.values(keys));
    throw error;
  }
}

export async function listGroupPhotos(
  groupId: string,
  viewerId: string,
  { cursor, limit }: ListPhotosQuery,
): Promise<{ photos: PhotoView[]; nextCursor: string | null }> {
  await requireMembership(groupId, viewerId);

  const rows = await photosRepository.listGroupPhotos(groupId, { cursor, take: limit + 1 });
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    photos: page.map((photo) => toPhotoView(photo, viewerId)),
    nextCursor: rows.length > limit && last ? encodePhotoCursor(last) : null,
  };
}

/** 404 (never 403) for photos the viewer can't see, so their existence isn't revealed. */
export async function getPhoto(photoId: string, viewerId: string): Promise<PhotoDetailView> {
  const photo = await photosRepository.findVisiblePhoto(photoId, viewerId);
  if (!photo) throw notFound("Photo not found");
  return toPhotoDetailView(photo, viewerId);
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

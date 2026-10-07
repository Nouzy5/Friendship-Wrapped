import { AppError, badRequest, notFound } from "../../lib/errors.js";
import { IMAGE_CONTENT_TYPE, processAvatar } from "../../lib/images.js";
import { verifyPassword } from "../../lib/password.js";
import { withTransaction } from "../../lib/prisma.js";
import * as storage from "../../lib/storage.js";
import { generateToken } from "../../lib/tokens.js";
import * as commentsRepository from "../comments/comments.repository.js";
import * as groupsRepository from "../groups/groups.repository.js";
import { leaveInTransaction } from "../groups/groups.service.js";
import { groupStoragePrefix } from "../photos/photo-keys.js";
import * as photosRepository from "../photos/photos.repository.js";
import * as wrappedRepository from "../wrapped/wrapped.repository.js";
import { toPublicUser, type PublicUser } from "./user.dto.js";
import * as usersRepository from "./users.repository.js";
import type { UpdateProfileInput } from "./users.schemas.js";

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
  const user = await usersRepository.updateUserProfile(userId, { displayName: input.displayName });
  return toPublicUser(user);
}

/** Swaps the stored avatar key and returns the user plus the key it replaced. */
function replaceAvatarKey(userId: string, avatarKey: string | null) {
  return withTransaction(async (tx) => {
    const previous = await usersRepository.findAvatarKey(userId, tx);
    const user = await usersRepository.setAvatarKey(userId, avatarKey, tx);
    return { user, previousKey: previous?.avatarKey ?? null };
  });
}

export async function setAvatar(userId: string, image: Buffer | undefined): Promise<PublicUser> {
  if (!image) throw badRequest("Choose a picture to upload");

  const avatar = await processAvatar(image);
  // A fresh key per upload, so the avatar URL (derived from it) changes and caches stay correct.
  const key = `users/${userId}/avatars/${generateToken(16)}.webp`;
  await storage.putObject(key, avatar.data, IMAGE_CONTENT_TYPE);

  let result: Awaited<ReturnType<typeof replaceAvatarKey>>;
  try {
    result = await replaceAvatarKey(userId, key);
  } catch (error) {
    await storage.discardObjects([key]);
    throw error;
  }

  if (result.previousKey) await storage.discardObjects([result.previousKey]);
  return toPublicUser(result.user);
}

export async function removeAvatar(userId: string): Promise<PublicUser> {
  const { user, previousKey } = await replaceAvatarKey(userId, null);
  if (previousKey) await storage.discardObjects([previousKey]);
  return toPublicUser(user);
}

/**
 * Deletes the account and everything the person put in, once they've confirmed with their
 * password. The policy:
 * - Their photos go, in every group, with the reactions, comments and favorites on them
 *   and their image files. So do their own comments, reactions, favorites, profile picture
 *   and sessions.
 * - They leave every group as if they'd tapped "Leave": a group they own passes to its
 *   longest-standing member, and a group they're the last member of is deleted.
 * - Albums they created stay with their group.
 * - Saved Wrapped that include them are dropped, so those years are counted again without them.
 */
export async function deleteAccount(userId: string, password: string): Promise<void> {
  const account = await usersRepository.findPasswordHash(userId);
  if (!account) throw notFound("Account not found");
  if (!(await verifyPassword(account.passwordHash, password))) {
    throw new AppError(400, "INCORRECT_PASSWORD", "Incorrect password", [
      { path: "password", message: "That's not your password" },
    ]);
  }

  const { storageKeys, deletedGroupIds } = await withTransaction(async (tx) => {
    const deletedGroupIds: string[] = [];
    for (const { group } of await groupsRepository.listGroupsForUser(userId, tx)) {
      const { groupDeleted } = await leaveInTransaction(group.id, userId, tx);
      if (groupDeleted) deletedGroupIds.push(group.id);
    }

    const photos = await photosRepository.listPhotoKeysByUploader(userId, tx);
    await wrappedRepository.deleteWrappedMentioning(userId, tx);
    await commentsRepository.deleteCommentsByAuthor(userId, tx);
    await photosRepository.deletePhotosByUploader(userId, tx);
    const { avatarKey } = await usersRepository.deleteUser(userId, tx);

    const storageKeys = photos.flatMap((photo) => [photo.storageKey, photo.mediumKey, photo.thumbnailKey]);
    if (avatarKey) storageKeys.push(avatarKey);
    return { storageKeys, deletedGroupIds };
  });

  // The rows are gone; now the files.
  await storage.discardObjects(storageKeys);
  for (const groupId of deletedGroupIds) await storage.discardPrefix(groupStoragePrefix(groupId));
}

/** Profile pictures are visible to the person themselves and anyone they share a group with. */
export async function getAvatarImage(userId: string, viewerId: string): Promise<storage.StoredObject> {
  const canSee = userId === viewerId || (await groupsRepository.shareAGroup(userId, viewerId));
  const avatarKey = canSee ? (await usersRepository.findAvatarKey(userId))?.avatarKey : null;
  const image = avatarKey ? await storage.getObject(avatarKey) : null;
  if (!image) throw notFound("No profile picture");
  return image;
}

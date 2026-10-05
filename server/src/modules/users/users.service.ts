import { badRequest, notFound } from "../../lib/errors.js";
import { IMAGE_CONTENT_TYPE, processAvatar } from "../../lib/images.js";
import { withTransaction } from "../../lib/prisma.js";
import * as storage from "../../lib/storage.js";
import { generateToken } from "../../lib/tokens.js";
import * as groupsRepository from "../groups/groups.repository.js";
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

/** Profile pictures are visible to the person themselves and anyone they share a group with. */
export async function getAvatarImage(userId: string, viewerId: string): Promise<storage.StoredObject> {
  const canSee = userId === viewerId || (await groupsRepository.shareAGroup(userId, viewerId));
  const avatarKey = canSee ? (await usersRepository.findAvatarKey(userId))?.avatarKey : null;
  const image = avatarKey ? await storage.getObject(avatarKey) : null;
  if (!image) throw notFound("No profile picture");
  return image;
}

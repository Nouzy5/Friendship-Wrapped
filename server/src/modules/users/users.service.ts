import type { PublicUser } from "./user.dto.js";
import * as usersRepository from "./users.repository.js";
import type { UpdateProfileInput } from "./users.schemas.js";

export function updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
  return usersRepository.updateUserProfile(userId, { displayName: input.displayName });
}

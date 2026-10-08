import { badRequest, notFound } from "../../lib/errors.js";
import { toUserSummary, type UserSummary } from "../users/user.dto.js";
import * as usersRepository from "../users/users.repository.js";
import * as blocksRepository from "./blocks.repository.js";

export async function listBlocked(userId: string): Promise<UserSummary[]> {
  const rows = await blocksRepository.listBlocked(userId);
  return rows.map(({ blocked }) => toUserSummary(blocked));
}

/**
 * A block works both ways for content: neither person sees the other's photos, comments or
 * reactions, and no notifications pass between them. Both stay in their shared groups.
 */
export async function block(userId: string, blockedId: string): Promise<void> {
  if (blockedId === userId) throw badRequest("You can't block yourself");
  const [user] = await usersRepository.findUserSummaries([blockedId]);
  if (!user) throw notFound("User not found");
  await blocksRepository.addBlock(userId, blockedId);
}

/** Unblocking someone who isn't blocked is a no-op. */
export async function unblock(userId: string, blockedId: string): Promise<void> {
  await blocksRepository.removeBlock(userId, blockedId);
}

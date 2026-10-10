import type { Prisma } from "../../generated/prisma/client.js";
import { adminEmails } from "../../config/env.js";
import { apiPath } from "../../lib/api-path.js";
import { sha256Hex } from "../../lib/tokens.js";

/** The user fields shown wherever a person appears (members, photo uploaders, …). */
export const userSummarySelect = {
  id: true,
  username: true,
  displayName: true,
  avatarKey: true,
} satisfies Prisma.UserSelect;

/** What a person sees of their own account, which is more than anyone else sees. Never includes the password hash. */
export const publicUserSelect = {
  ...userSummarySelect,
  email: true,
  emailVerifiedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type UserSummaryRow = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;
type PublicUserRow = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export type UserSummary = {
  id: string;
  username: string;
  displayName: string;
  /** Null when the user has no profile picture. */
  avatarUrl: string | null;
};

export type PublicUser = UserSummary & {
  createdAt: Date;
  /** Null only for an account made before an email was required. */
  email: string | null;
  /** Whether the person has opened the link we emailed. Nobody gets into the app without it. */
  emailVerified: boolean;
  /** Whether the person may open the admin panel: a verified email on the ADMIN_EMAILS list. */
  isAdmin: boolean;
};

/**
 * The storage key never leaves the server. The `v` parameter changes with each new
 * picture, so browsers can cache an avatar URL forever.
 */
function avatarUrl(userId: string, avatarKey: string | null): string | null {
  if (!avatarKey) return null;
  return apiPath(`/users/${userId}/avatar?v=${sha256Hex(avatarKey).slice(0, 16)}`);
}

export function toUserSummary({ avatarKey, ...user }: UserSummaryRow): UserSummary {
  return { ...user, avatarUrl: avatarUrl(user.id, avatarKey) };
}

export function toPublicUser({ avatarKey, emailVerifiedAt, ...user }: PublicUserRow): PublicUser {
  const emailVerified = user.email !== null && emailVerifiedAt !== null;
  return {
    ...user,
    avatarUrl: avatarUrl(user.id, avatarKey),
    emailVerified,
    isAdmin: emailVerified && user.email !== null && adminEmails.has(user.email),
  };
}

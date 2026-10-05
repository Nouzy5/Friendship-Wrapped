import type { Prisma } from "../../generated/prisma/client.js";

/** The only user fields that may be sent to clients. Never includes the password hash. */
export const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

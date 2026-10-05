import { prisma } from "../../lib/prisma.js";
import { publicUserSelect, type PublicUser } from "./user.dto.js";

export function createUser(data: {
  username: string;
  displayName: string;
  passwordHash: string;
}): Promise<PublicUser> {
  return prisma.user.create({ data, select: publicUserSelect });
}

/** The one query that reads the password hash — used only to verify a login. */
export function findUserCredentials(username: string) {
  return prisma.user.findUnique({
    where: { username },
    select: { ...publicUserSelect, passwordHash: true },
  });
}

export function updateUserProfile(id: string, data: { displayName: string }): Promise<PublicUser> {
  return prisma.user.update({ where: { id }, data, select: publicUserSelect });
}

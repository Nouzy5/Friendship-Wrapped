import { prisma } from "../../lib/prisma.js";

/** Notes another sign-in from a device the person has used before. Returns how many rows matched (0 or 1). */
export async function touchDevice(userId: string, id: string, label: string, at: Date) {
  const { count } = await prisma.knownDevice.updateMany({ where: { userId, id }, data: { label, lastSeenAt: at } });
  return count;
}

export function createDevice(data: { userId: string; id: string; label: string }) {
  return prisma.knownDevice.create({ data, select: { id: true } });
}

/** The devices past the newest `keep`, least recently used first to go. */
export async function listSurplusDevices(userId: string, keep: number) {
  const rows = await prisma.knownDevice.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    skip: keep,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export function deleteDevices(userId: string, ids: string[]) {
  return prisma.knownDevice.deleteMany({ where: { userId, id: { in: ids } } });
}

/** For the admin panel. */
export function listDevices(userId: string) {
  return prisma.knownDevice.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    select: { label: true, firstSeenAt: true, lastSeenAt: true },
  });
}

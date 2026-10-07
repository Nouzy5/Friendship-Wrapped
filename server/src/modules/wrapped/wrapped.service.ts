import type { Prisma } from "../../generated/prisma/client.js";
import { notFound } from "../../lib/errors.js";
import { isUniqueConstraintError } from "../../lib/prisma.js";
import { yearIn, yearRangeIn } from "../../lib/time-zone.js";
import { computeYearNumbers, toYearStats, type YearNumbers } from "../analytics/analytics.service.js";
import * as groupsRepository from "../groups/groups.repository.js";
import { getGroup } from "../groups/groups.service.js";
import { toSlides, type WrappedSummary, type WrappedView } from "./wrapped.dto.js";
import * as wrappedRepository from "./wrapped.repository.js";

/** Bumped when YearNumbers changes shape: saved Wrappeds in an older format are counted again. */
const FORMAT_VERSION = 1;

type SavedNumbers = YearNumbers & { version: number };

const isFinal = (year: number, timeZone: string, now: Date) => yearRangeIn(year, timeZone).to <= now;

/**
 * Every Wrapped the user can open: one for each of their groups and each year (in their
 * time zone) in which the group posted a photo. Newest year first, then by group name.
 */
export async function listWrapped(userId: string, timeZone: string): Promise<WrappedSummary[]> {
  const memberships = await groupsRepository.listGroupsForUser(userId);
  const groups = new Map(memberships.map(({ group }) => [group.id, group]));
  const spans = await wrappedRepository.findPhotoSpans([...groups.keys()]);

  // The first and last photos' years have photos; any years in between are checked.
  const found = await Promise.all(
    spans.flatMap(({ groupId, first, last }) => {
      const firstYear = yearIn(first, timeZone);
      const lastYear = yearIn(last, timeZone);
      return Array.from({ length: lastYear - firstYear + 1 }, async (_, index) => {
        const year = firstYear + index;
        const hasPhotos =
          year === firstYear ||
          year === lastYear ||
          (await wrappedRepository.hasPhotosBetween(groupId, yearRangeIn(year, timeZone)));
        return hasPhotos ? [{ groupId, year }] : [];
      });
    }),
  );

  const now = new Date();
  return found
    .flat()
    .map(({ groupId, year }) => {
      const { id, name, emoji } = groups.get(groupId)!;
      return { group: { id, name, emoji }, year, final: isFinal(year, timeZone, now) };
    })
    .sort((a, b) => b.year - a.year || a.group.name.localeCompare(b.group.name));
}

/**
 * A group's Wrapped for a year, for its members. While the year is in progress it's
 * counted live; once it's over, the first opening saves the numbers and every later
 * one shows the same story. A year without photos has no Wrapped.
 */
export async function getWrapped(
  groupId: string,
  viewerId: string,
  { year, tz }: { year: number; tz: string },
): Promise<WrappedView> {
  const group = await getGroup(groupId, viewerId);
  const key = { groupId, year, timeZone: tz };
  const now = new Date();
  const final = isFinal(year, tz, now);

  const saved = final ? await wrappedRepository.findWrapped(key) : null;
  let numbers: YearNumbers;
  let generatedAt = now;
  if (saved && (saved.stats as SavedNumbers).version === FORMAT_VERSION) {
    numbers = saved.stats as SavedNumbers;
    generatedAt = saved.generatedAt;
  } else {
    numbers = await computeYearNumbers(groupId, year, tz);
    if (final && numbers.photos.total > 0) await save(key, numbers, generatedAt);
  }
  if (numbers.photos.total === 0) throw notFound(`There's no Wrapped for ${year}`);

  const stats = await toYearStats(numbers, { group, year, timeZone: tz, viewerId });
  return { group: stats.group, year, final, timeZone: tz, generatedAt, slides: toSlides(stats) };
}

async function save(key: wrappedRepository.WrappedKey, numbers: YearNumbers, generatedAt: Date) {
  const stats: SavedNumbers = { version: FORMAT_VERSION, ...numbers };
  try {
    await wrappedRepository.saveWrapped(key, stats as unknown as Prisma.InputJsonValue, generatedAt);
  } catch (error) {
    // Two friends opened it at the same moment: the other request saved the same numbers.
    if (!isUniqueConstraintError(error)) throw error;
  }
}

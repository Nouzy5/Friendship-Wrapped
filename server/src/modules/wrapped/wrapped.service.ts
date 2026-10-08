import type { Prisma } from "../../generated/prisma/client.js";
import { notFound } from "../../lib/errors.js";
import { isUniqueConstraintError } from "../../lib/prisma.js";
import { yearIn, yearRangeIn } from "../../lib/time-zone.js";
import { computeYearNumbers, toYearStats, type YearNumbers } from "../analytics/analytics.service.js";
import * as groupsRepository from "../groups/groups.repository.js";
import { getGroup } from "../groups/groups.service.js";
import { toSlides, type WrappedSummary, type WrappedView } from "./wrapped.dto.js";
import * as wrappedRepository from "./wrapped.repository.js";

/**
 * Bumped when YearNumbers changes shape or how it's counted: saved Wrappeds in an older
 * format are counted again.
 * - 2: days start at the right moment where clocks skip midnight (Chile, Cuba, the Azores).
 */
const FORMAT_VERSION = 2;

type SavedNumbers = YearNumbers & { version: number };

/**
 * How long after the year ends before it's saved: a photo taken at 23:59 that's still
 * uploading at midnight (or a reaction on its way) still belongs in that year's story.
 */
const SAVE_AFTER_MS = 10 * 60 * 1000;

const isFinal = (year: number, timeZone: string, now: Date) => yearRangeIn(year, timeZone).to <= now;
const canSave = (year: number, timeZone: string, now: Date) =>
  yearRangeIn(year, timeZone).to.getTime() + SAVE_AFTER_MS <= now.getTime();

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
  const savedVersion = saved ? (saved.stats as SavedNumbers).version : null;
  let numbers: YearNumbers;
  let generatedAt = now;
  if (saved && savedVersion === FORMAT_VERSION) {
    numbers = saved.stats as SavedNumbers;
    generatedAt = saved.generatedAt;
  } else {
    numbers = await computeYearNumbers(groupId, year, tz);
    // A version newer than this server's (mid-deploy) is left for the newer server.
    const outdated = savedVersion === null || savedVersion < FORMAT_VERSION;
    if (outdated && canSave(year, tz, now) && numbers.photos.total > 0) {
      await save(key, numbers, generatedAt, { replace: saved !== null });
    }
  }
  if (numbers.photos.total === 0) throw notFound(`There's no Wrapped for ${year}`);

  const stats = await toYearStats(numbers, { group, year, timeZone: tz, viewerId });
  return { group: stats.group, year, final, timeZone: tz, generatedAt, slides: toSlides(stats) };
}

async function save(
  key: wrappedRepository.WrappedKey,
  numbers: YearNumbers,
  generatedAt: Date,
  { replace }: { replace: boolean },
) {
  const stats = { version: FORMAT_VERSION, ...numbers } satisfies SavedNumbers as unknown as Prisma.InputJsonValue;
  if (replace) {
    await wrappedRepository.replaceWrapped(key, stats, generatedAt);
    return;
  }
  try {
    await wrappedRepository.createWrapped(key, stats, generatedAt);
  } catch (error) {
    // Two friends opened it at the same moment: the first save stands.
    if (!isUniqueConstraintError(error)) throw error;
  }
}

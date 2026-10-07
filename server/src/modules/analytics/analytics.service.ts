import { dayStartsOfYear, yearRangeIn } from "../../lib/time-zone.js";
import { getGroup } from "../groups/groups.service.js";
import type { PhotoView } from "../photos/photo.dto.js";
import { listGroupPhotosByIds } from "../photos/photos.service.js";
import { toUserSummary, type UserSummary } from "../users/user.dto.js";
import * as usersRepository from "../users/users.repository.js";
import * as analyticsRepository from "./analytics.repository.js";

/** Up to this many photos for the Wrapped collage. */
const HIGHLIGHT_COUNT = 9;

export type PersonCount = { user: UserSummary; count: number };
type IdCount = { userId: string; count: number };

/**
 * A group's year in numbers, with people and photos as ids: plain JSON, which is what a
 * finished year's Wrapped saves. Names, avatars and photos are looked up when it's shown,
 * so they're always current (and a photo deleted since simply drops out).
 * Every ranking is already in order.
 */
export type YearNumbers = {
  activeUserCount: number;
  photos: {
    total: number;
    byMonth: number[];
    byUser: IdCount[];
    mostActiveMonth: { month: number; count: number } | null;
    mostActiveDay: { date: string; count: number } | null;
  };
  reactions: { total: number; byUser: IdCount[]; mostReactedPhoto: { photoId: string; count: number } | null };
  comments: { total: number; byUser: IdCount[] };
  highlightIds: string[];
};

/**
 * A group's year in numbers: everything the Wrapped slides need. Everything is counted
 * live from photos, reactions and comments (no aggregate tables).
 */
export type YearStats = {
  group: { id: string; name: string; emoji: string };
  year: number;
  /** The year, its months and its days are the viewer's own, in this zone. */
  timeZone: string;
  from: Date;
  to: Date;
  /** Members today. */
  memberCount: number;
  /** People who posted, reacted or commented in the group during the year (including any who have left since). */
  activeUserCount: number;
  photos: {
    /** Posted during the year. */
    total: number;
    /** January first. */
    byMonth: number[];
    /** Most photos first. */
    byUser: PersonCount[];
    /** Most photos; on a tie, whoever posted first that year. */
    topPhotographer: PersonCount | null;
    /** 1–12; on a tie, the earlier month. */
    mostActiveMonth: { month: number; count: number } | null;
    /** "YYYY-MM-DD"; on a tie, the earlier day. */
    mostActiveDay: { date: string; count: number } | null;
  };
  reactions: {
    /** Given during the year, on any of the group's photos. */
    total: number;
    byUser: PersonCount[];
    /** Of the photos posted during the year, the one with the most reactions (on a tie, the earlier photo). */
    mostReactedPhoto: { photo: PhotoView; count: number } | null;
  };
  comments: {
    /** Written during the year, on any of the group's photos. */
    total: number;
    byUser: PersonCount[];
  };
  /** The year's most reacted-to and commented-on photos, for the collage (on a tie, the earlier photo). */
  highlights: PhotoView[];
};

/** The index of the largest value (the first, on a tie), or -1 when every value is zero. */
function indexOfMax(values: number[]): number {
  let best = -1;
  values.forEach((value, index) => {
    if (value > 0 && (best === -1 || value > values[best]!)) best = index;
  });
  return best;
}

const sum = (counts: Iterable<number>) => [...counts].reduce((total, count) => total + count, 0);

/** The calendar date of the `index`th day of the year, "YYYY-MM-DD". */
const dateOfDay = (year: number, index: number) => new Date(Date.UTC(year, 0, 1 + index)).toISOString().slice(0, 10);

/** Counts the group's year in the time zone. Callers check the viewer is a member first. */
export async function computeYearNumbers(groupId: string, year: number, timeZone: string): Promise<YearNumbers> {
  const dayStarts = dayStartsOfYear(year, timeZone);
  const range = { from: dayStarts[0]!, to: dayStarts.at(-1)! };

  const [photos, reactionsByUser, commentsByUser, reactionsByPhoto, commentsByPhoto] = await Promise.all([
    analyticsRepository.listPhotoTimes(groupId, range),
    analyticsRepository.countReactionsByUser(groupId, range),
    analyticsRepository.countCommentsByUser(groupId, range),
    analyticsRepository.countReactionsByPhoto(groupId, range),
    analyticsRepository.countCommentsByPhoto(groupId, range),
  ]);

  // Walk the photos (oldest first) alongside the year's days, counting per day and per person.
  const photosByDay = dayStarts.slice(1).map(() => 0);
  const photosByUser = new Map<string, number>();
  const firstPhotoAt = new Map<string, Date>();
  let day = 0;
  for (const photo of photos) {
    while (photo.createdAt >= dayStarts[day + 1]!) day++;
    photosByDay[day]! += 1;
    photosByUser.set(photo.uploaderId, (photosByUser.get(photo.uploaderId) ?? 0) + 1);
    if (!firstPhotoAt.has(photo.uploaderId)) firstPhotoAt.set(photo.uploaderId, photo.createdAt);
  }
  const photosByMonth = Array.from({ length: 12 }, () => 0);
  photosByDay.forEach((count, index) => {
    photosByMonth[new Date(Date.UTC(year, 0, 1 + index)).getUTCMonth()]! += count;
  });

  // Ties between people go by name, so everyone who appears is looked up (in one query).
  const activeIds = new Set([...photosByUser.keys(), ...reactionsByUser.keys(), ...commentsByUser.keys()]);
  const names = new Map(
    (await usersRepository.findUserSummaries([...activeIds])).map((user) => [user.id, user.displayName]),
  );
  const rank = (counts: Map<string, number>, tieBreak: (a: string, b: string) => number): IdCount[] =>
    [...counts]
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count || tieBreak(a.userId, b.userId));
  const byName = (a: string, b: string) => (names.get(a) ?? "").localeCompare(names.get(b) ?? "");
  const byFirstPhoto = (a: string, b: string) => firstPhotoAt.get(a)!.getTime() - firstPhotoAt.get(b)!.getTime();

  // Photos in posting order, so ties go to the earlier photo.
  const engagement = (photoId: string) => (reactionsByPhoto.get(photoId) ?? 0) + (commentsByPhoto.get(photoId) ?? 0);
  const mostReacted = photos.reduce<{ photoId: string; count: number } | null>((best, photo) => {
    const count = reactionsByPhoto.get(photo.id) ?? 0;
    return count > (best?.count ?? 0) ? { photoId: photo.id, count } : best;
  }, null);
  const highlightIds = photos
    .map((photo, order) => ({ id: photo.id, score: engagement(photo.id), order }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, HIGHLIGHT_COUNT)
    .map(({ id }) => id);

  const busiestMonth = indexOfMax(photosByMonth);
  const busiestDay = indexOfMax(photosByDay);

  return {
    activeUserCount: activeIds.size,
    photos: {
      total: photos.length,
      byMonth: photosByMonth,
      byUser: rank(photosByUser, byFirstPhoto),
      mostActiveMonth: busiestMonth === -1 ? null : { month: busiestMonth + 1, count: photosByMonth[busiestMonth]! },
      mostActiveDay: busiestDay === -1 ? null : { date: dateOfDay(year, busiestDay), count: photosByDay[busiestDay]! },
    },
    reactions: {
      total: sum(reactionsByUser.values()),
      byUser: rank(reactionsByUser, byName),
      mostReactedPhoto: mostReacted,
    },
    comments: {
      total: sum(commentsByUser.values()),
      byUser: rank(commentsByUser, byName),
    },
    highlightIds,
  };
}

type YearContext = {
  group: { id: string; name: string; emoji: string; memberCount: number };
  year: number;
  timeZone: string;
  viewerId: string;
};

/** Puts names, avatars and photos to a year's numbers, as the viewer sees them. */
export async function toYearStats(
  numbers: YearNumbers,
  { group, year, timeZone, viewerId }: YearContext,
): Promise<YearStats> {
  const counts = [...numbers.photos.byUser, ...numbers.reactions.byUser, ...numbers.comments.byUser];
  const mostReacted = numbers.reactions.mostReactedPhoto;
  const photoIds = new Set([...(mostReacted ? [mostReacted.photoId] : []), ...numbers.highlightIds]);
  const [users, views] = await Promise.all([
    usersRepository.findUserSummaries([...new Set(counts.map(({ userId }) => userId))]),
    listGroupPhotosByIds(group.id, [...photoIds], viewerId),
  ]);

  const people = new Map(users.map((user) => [user.id, toUserSummary(user)]));
  const withPeople = (ranked: IdCount[]): PersonCount[] =>
    ranked.flatMap(({ userId, count }) => {
      const user = people.get(userId);
      return user ? [{ user, count }] : [];
    });
  const viewOf = new Map(views.map((view) => [view.id, view]));
  const photographers = withPeople(numbers.photos.byUser);
  const mostReactedView = mostReacted && viewOf.get(mostReacted.photoId);

  return {
    group: { id: group.id, name: group.name, emoji: group.emoji },
    year,
    timeZone,
    ...yearRangeIn(year, timeZone),
    memberCount: group.memberCount,
    activeUserCount: numbers.activeUserCount,
    photos: {
      total: numbers.photos.total,
      byMonth: numbers.photos.byMonth,
      byUser: photographers,
      topPhotographer: photographers[0] ?? null,
      mostActiveMonth: numbers.photos.mostActiveMonth,
      mostActiveDay: numbers.photos.mostActiveDay,
    },
    reactions: {
      total: numbers.reactions.total,
      byUser: withPeople(numbers.reactions.byUser),
      mostReactedPhoto: mostReacted && mostReactedView ? { photo: mostReactedView, count: mostReacted.count } : null,
    },
    comments: {
      total: numbers.comments.total,
      byUser: withPeople(numbers.comments.byUser),
    },
    highlights: numbers.highlightIds.flatMap((id) => viewOf.get(id) ?? []),
  };
}

export async function getYearStats(
  groupId: string,
  viewerId: string,
  { year, tz }: { year: number; tz: string },
): Promise<YearStats> {
  const group = await getGroup(groupId, viewerId);
  const numbers = await computeYearNumbers(groupId, year, tz);
  return toYearStats(numbers, { group, year, timeZone: tz, viewerId });
}

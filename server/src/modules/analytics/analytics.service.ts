import type { MemberColor } from "../../generated/prisma/client.js";
import { dayStartsOfYear, yearRangeIn } from "../../lib/time-zone.js";
import * as groupsRepository from "../groups/groups.repository.js";
import { getGroup } from "../groups/groups.service.js";
import type { PhotoView } from "../photos/photo.dto.js";
import { listGroupPhotosByIds } from "../photos/photos.service.js";
import * as settingsRepository from "../settings/settings.repository.js";
import { toUserSummary, type UserSummary } from "../users/user.dto.js";
import * as usersRepository from "../users/users.repository.js";
import * as analyticsRepository from "./analytics.repository.js";

/** Up to this many photos for the Wrapped collage. */
const HIGHLIGHT_COUNT = 9;

export type PersonCount = {
  user: UserSummary;
  /** Their colour in the group today; null for people who have left (or never got one). */
  color: MemberColor | null;
  count: number;
};
type IdCount = { userId: string; count: number };
type PhotoCount = { userId: string; photoId: string; count: number };

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
    /** Who posted in the busiest month. */
    mostActiveMonthByUser: IdCount[];
    mostActiveDay: { date: string; count: number } | null;
    /** Each person's own busiest month (the earlier one on a tie), for their personal card. Format 4. */
    busiestMonthByUser: { userId: string; month: number; count: number }[];
  };
  reactions: {
    total: number;
    byUser: IdCount[];
    mostReactedPhoto: { photoId: string; count: number } | null;
    /**
     * Each photographer's most reacted-to photo, best first: when someone is left out of
     * Wrapped, the next person's best photo takes the slide.
     */
    mostReactedByUploader: PhotoCount[];
    /** Reactions each person's photos of the year received, from anyone and whenever given. Format 4. */
    receivedByUser: IdCount[];
  };
  comments: {
    total: number;
    byUser: IdCount[];
    /** Comments each person's photos of the year received. Format 4. */
    receivedByUser: IdCount[];
  };
  highlightIds: string[];
};

/**
 * The viewer's own year in the group, for their personal card: counts and a best photo,
 * nothing about anyone else. Null when they did nothing that year.
 */
export type YourYear = {
  photos: number;
  /** Reactions you gave during the year. */
  reactionsGiven: number;
  commentsWritten: number;
  /** Reactions your photos of the year received. */
  reactionsReceived: number;
  commentsReceived: number;
  /** The month you posted the most in (the earlier one on a tie). */
  busiestMonth: { month: number; count: number } | null;
  /** Your photo of the year with the most reactions, if any got one. */
  bestPhoto: { photo: PhotoView; count: number } | null;
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
    /** Everyone who posted, including people left out of Wrapped. */
    photographerCount: number;
    /** January first. */
    byMonth: number[];
    /**
     * Most photos first. Every list of people here leaves out anyone who chose not to
     * appear in Wrapped (the totals still count them).
     */
    byUser: PersonCount[];
    /** Most photos; on a tie, whoever posted first that year. */
    topPhotographer: PersonCount | null;
    /** 1–12; on a tie, the earlier month. */
    mostActiveMonth: { month: number; count: number } | null;
    /** Who posted in that month, most first (on a tie, whoever posted first in it). */
    mostActiveMonthByUser: PersonCount[];
    /** "YYYY-MM-DD"; on a tie, the earlier day. */
    mostActiveDay: { date: string; count: number } | null;
  };
  reactions: {
    /** Given during the year, on any of the group's photos. */
    total: number;
    byUser: PersonCount[];
    /**
     * Of the photos posted during the year, the one with the most reactions (on a tie, the
     * earlier photo), leaving out photos by people left out of Wrapped.
     */
    mostReactedPhoto: { photo: PhotoView; count: number } | null;
  };
  comments: {
    /** Written during the year, on any of the group's photos. */
    total: number;
    byUser: PersonCount[];
  };
  /** The year's most reacted-to and commented-on photos, for the collage (on a tie, the earlier photo). */
  highlights: PhotoView[];
  /** The viewer's own year (see YourYear). Everyone sees only their own. */
  you: YourYear | null;
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
  const monthOf: number[] = [];
  let day = 0;
  for (const photo of photos) {
    while (photo.createdAt >= dayStarts[day + 1]!) day++;
    photosByDay[day]! += 1;
    monthOf.push(new Date(Date.UTC(year, 0, 1 + day)).getUTCMonth());
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

  // Each photographer's best photo (photos in posting order, so ties go to the earlier one), best first.
  const bestByUploader = new Map<string, PhotoCount & { order: number }>();
  photos.forEach((photo, order) => {
    const count = reactionsByPhoto.get(photo.id) ?? 0;
    if (count > (bestByUploader.get(photo.uploaderId)?.count ?? 0)) {
      bestByUploader.set(photo.uploaderId, { userId: photo.uploaderId, photoId: photo.id, count, order });
    }
  });
  const mostReactedByUploader = [...bestByUploader.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ userId, photoId, count }) => ({ userId, photoId, count }));

  const busiestMonth = indexOfMax(photosByMonth);
  const busiestDay = indexOfMax(photosByDay);

  // Who posted in the busiest month; the Map keeps first-posting order, which settles ties.
  const busiestMonthByUser = new Map<string, number>();
  photos.forEach((photo, index) => {
    if (monthOf[index] === busiestMonth) {
      busiestMonthByUser.set(photo.uploaderId, (busiestMonthByUser.get(photo.uploaderId) ?? 0) + 1);
    }
  });

  // For each person: their own busiest month, and what their photos of the year received.
  const monthsByUser = new Map<string, number[]>();
  const reactionsReceived = new Map<string, number>();
  const commentsReceived = new Map<string, number>();
  photos.forEach((photo, index) => {
    const months = monthsByUser.get(photo.uploaderId) ?? Array.from({ length: 12 }, () => 0);
    months[monthOf[index]!]! += 1;
    monthsByUser.set(photo.uploaderId, months);
    reactionsReceived.set(photo.uploaderId, (reactionsReceived.get(photo.uploaderId) ?? 0) + (reactionsByPhoto.get(photo.id) ?? 0));
    commentsReceived.set(photo.uploaderId, (commentsReceived.get(photo.uploaderId) ?? 0) + (commentsByPhoto.get(photo.id) ?? 0));
  });
  const ownBusiestMonths = [...monthsByUser].map(([userId, months]) => {
    const best = indexOfMax(months); // someone with photos has a month; the earlier one on a tie
    return { userId, month: best + 1, count: months[best]! };
  });
  const withoutZeros = (counts: Map<string, number>) => new Map([...counts].filter(([, count]) => count > 0));

  return {
    activeUserCount: activeIds.size,
    photos: {
      total: photos.length,
      byMonth: photosByMonth,
      byUser: rank(photosByUser, byFirstPhoto),
      mostActiveMonth: busiestMonth === -1 ? null : { month: busiestMonth + 1, count: photosByMonth[busiestMonth]! },
      mostActiveMonthByUser: rank(busiestMonthByUser, () => 0),
      mostActiveDay: busiestDay === -1 ? null : { date: dateOfDay(year, busiestDay), count: photosByDay[busiestDay]! },
      busiestMonthByUser: ownBusiestMonths,
    },
    reactions: {
      total: sum(reactionsByUser.values()),
      byUser: rank(reactionsByUser, byName),
      mostReactedPhoto: mostReacted,
      mostReactedByUploader,
      receivedByUser: rank(withoutZeros(reactionsReceived), byName),
    },
    comments: {
      total: sum(commentsByUser.values()),
      byUser: rank(commentsByUser, byName),
      receivedByUser: rank(withoutZeros(commentsReceived), byName),
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

/**
 * Puts names, colours, avatars and photos to a year's numbers, as the viewer sees them.
 * Who chose to be left out of Wrapped is checked now, so a saved year follows the current setting.
 */
export async function toYearStats(
  numbers: YearNumbers,
  { group, year, timeZone, viewerId }: YearContext,
): Promise<YearStats> {
  const counts = [...numbers.photos.byUser, ...numbers.reactions.byUser, ...numbers.comments.byUser];
  const personIds = [...new Set(counts.map(({ userId }) => userId))];
  const candidates = numbers.reactions.mostReactedByUploader;
  const photoIds = new Set([...candidates.map(({ photoId }) => photoId), ...numbers.highlightIds]);
  const [users, views, colors, hidden] = await Promise.all([
    usersRepository.findUserSummaries(personIds),
    listGroupPhotosByIds(group.id, [...photoIds], viewerId),
    groupsRepository.listMemberColors(group.id),
    settingsRepository.findHiddenFromWrapped(personIds),
  ]);

  const people = new Map(users.map((user) => [user.id, toUserSummary(user)]));
  const withPeople = (ranked: IdCount[]): PersonCount[] =>
    ranked.flatMap(({ userId, count }) => {
      const user = people.get(userId);
      return user && !hidden.has(userId) ? [{ user, color: colors.get(userId) ?? null, count }] : [];
    });
  const viewOf = new Map(views.map((view) => [view.id, view]));
  const photographers = withPeople(numbers.photos.byUser);
  // A photo the viewer can't see (deleted, or a block) drops out, and the next best takes its place.
  const mostReacted = candidates.find(({ userId, photoId }) => !hidden.has(userId) && viewOf.has(photoId));

  // The viewer's own year. It's theirs alone, so opting out of appearing in Wrapped doesn't hide it from them.
  const countOf = (ranked: IdCount[]) => ranked.find(({ userId }) => userId === viewerId)?.count ?? 0;
  const mine = {
    photos: countOf(numbers.photos.byUser),
    reactionsGiven: countOf(numbers.reactions.byUser),
    commentsWritten: countOf(numbers.comments.byUser),
    reactionsReceived: countOf(numbers.reactions.receivedByUser),
    commentsReceived: countOf(numbers.comments.receivedByUser),
  };
  const myBusiestMonth = numbers.photos.busiestMonthByUser.find(({ userId }) => userId === viewerId);
  const myBest = candidates.find(({ userId, photoId }) => userId === viewerId && viewOf.has(photoId));
  const you: YourYear | null =
    mine.photos + mine.reactionsGiven + mine.commentsWritten === 0
      ? null
      : {
          ...mine,
          busiestMonth: myBusiestMonth ? { month: myBusiestMonth.month, count: myBusiestMonth.count } : null,
          bestPhoto: myBest ? { photo: viewOf.get(myBest.photoId)!, count: myBest.count } : null,
        };

  return {
    group: { id: group.id, name: group.name, emoji: group.emoji },
    year,
    timeZone,
    ...yearRangeIn(year, timeZone),
    memberCount: group.memberCount,
    activeUserCount: numbers.activeUserCount,
    photos: {
      total: numbers.photos.total,
      photographerCount: numbers.photos.byUser.length,
      byMonth: numbers.photos.byMonth,
      byUser: photographers,
      topPhotographer: photographers[0] ?? null,
      mostActiveMonth: numbers.photos.mostActiveMonth,
      mostActiveMonthByUser: withPeople(numbers.photos.mostActiveMonthByUser),
      mostActiveDay: numbers.photos.mostActiveDay,
    },
    reactions: {
      total: numbers.reactions.total,
      byUser: withPeople(numbers.reactions.byUser),
      mostReactedPhoto: mostReacted ? { photo: viewOf.get(mostReacted.photoId)!, count: mostReacted.count } : null,
    },
    comments: {
      total: numbers.comments.total,
      byUser: withPeople(numbers.comments.byUser),
    },
    highlights: numbers.highlightIds.flatMap((id) => viewOf.get(id) ?? []),
    you,
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

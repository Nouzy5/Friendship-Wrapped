import { dayStartsOfYear } from "../../lib/time-zone.js";
import { getGroup } from "../groups/groups.service.js";
import type { PhotoView } from "../photos/photo.dto.js";
import { listGroupPhotosByIds } from "../photos/photos.service.js";
import { toUserSummary, type UserSummary } from "../users/user.dto.js";
import * as usersRepository from "../users/users.repository.js";
import * as analyticsRepository from "./analytics.repository.js";

/** Up to this many photos for the Wrapped collage. */
const HIGHLIGHT_COUNT = 9;

export type PersonCount = { user: UserSummary; count: number };

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

export async function getYearStats(
  groupId: string,
  viewerId: string,
  { year, tz }: { year: number; tz: string },
): Promise<YearStats> {
  const group = await getGroup(groupId, viewerId);
  const dayStarts = dayStartsOfYear(year, tz);
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

  // Everyone who appears in the numbers, in one query.
  const activeIds = new Set([...photosByUser.keys(), ...reactionsByUser.keys(), ...commentsByUser.keys()]);
  const people = new Map(
    (await usersRepository.findUserSummaries([...activeIds])).map((user) => [user.id, toUserSummary(user)]),
  );
  const rank = (counts: Map<string, number>, tieBreak: (a: PersonCount, b: PersonCount) => number) =>
    [...counts]
      .flatMap(([userId, count]) => {
        const user = people.get(userId);
        return user ? [{ user, count }] : [];
      })
      .sort((a, b) => b.count - a.count || tieBreak(a, b));
  const byName = (a: PersonCount, b: PersonCount) => a.user.displayName.localeCompare(b.user.displayName);
  const byFirstPhoto = (a: PersonCount, b: PersonCount) =>
    firstPhotoAt.get(a.user.id)!.getTime() - firstPhotoAt.get(b.user.id)!.getTime();

  // Photos in posting order, so ties go to the earlier photo.
  const engagement = (photoId: string) => (reactionsByPhoto.get(photoId) ?? 0) + (commentsByPhoto.get(photoId) ?? 0);
  const mostReacted = photos.reduce<{ id: string; count: number } | null>((best, photo) => {
    const count = reactionsByPhoto.get(photo.id) ?? 0;
    return count > (best?.count ?? 0) ? { id: photo.id, count } : best;
  }, null);
  const highlightIds = photos
    .map((photo, order) => ({ id: photo.id, score: engagement(photo.id), order }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, HIGHLIGHT_COUNT)
    .map(({ id }) => id);
  const views = await listGroupPhotosByIds(
    groupId,
    [...new Set([...(mostReacted ? [mostReacted.id] : []), ...highlightIds])],
    viewerId,
  );
  const viewOf = new Map(views.map((view) => [view.id, view]));

  const photographers = rank(photosByUser, byFirstPhoto);
  const busiestMonth = indexOfMax(photosByMonth);
  const busiestDay = indexOfMax(photosByDay);
  const mostReactedView = mostReacted && viewOf.get(mostReacted.id);

  return {
    group: { id: group.id, name: group.name, emoji: group.emoji },
    year,
    timeZone: tz,
    from: range.from,
    to: range.to,
    memberCount: group.memberCount,
    activeUserCount: activeIds.size,
    photos: {
      total: photos.length,
      byMonth: photosByMonth,
      byUser: photographers,
      topPhotographer: photographers[0] ?? null,
      mostActiveMonth: busiestMonth === -1 ? null : { month: busiestMonth + 1, count: photosByMonth[busiestMonth]! },
      mostActiveDay: busiestDay === -1 ? null : { date: dateOfDay(year, busiestDay), count: photosByDay[busiestDay]! },
    },
    reactions: {
      total: sum(reactionsByUser.values()),
      byUser: rank(reactionsByUser, byName),
      mostReactedPhoto: mostReacted && mostReactedView ? { photo: mostReactedView, count: mostReacted.count } : null,
    },
    comments: {
      total: sum(commentsByUser.values()),
      byUser: rank(commentsByUser, byName),
    },
    highlights: highlightIds.flatMap((id) => viewOf.get(id) ?? []),
  };
}

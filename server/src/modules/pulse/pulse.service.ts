import { addDays, monthRangeIn, todayIn, weekRangeIn, weekStartOf, type CalendarDate } from "../../lib/time-zone.js";
import { requireMembership } from "../groups/groups.service.js";
import * as pulseRepository from "./pulse.repository.js";

/** The longest streak counted, about ten years of weeks. A real one is far shorter. */
const MAX_STREAK_WEEKS = 520;
/** Weeks looked up at once when counting back. */
const WEEKS_PER_BATCH = 8;

/**
 * How the group is doing, as numbers about the group. It deliberately has nothing about
 * individuals: who posted, and above all who didn't, is not in it.
 */
export type GroupPulse = {
  /** The zone the month and the weeks were worked out in. */
  timeZone: string;
  /** The calendar month it is now, in that zone. */
  month: {
    year: number;
    /** 1–12 */
    month: number;
    from: Date;
    to: Date;
    photos: number;
    /** Reactions given this month, on photos from any time. */
    reactions: number;
    /** Comments written this month, on photos from any time. */
    comments: number;
  };
  /** Weeks (Monday to Sunday) in a row with at least one photo from the group. */
  streak: {
    weeks: number;
    /** Whether this week already has a photo. If not, the streak counts up to last week and is still alive. */
    thisWeekDone: boolean;
  };
};

/**
 * The weeks in a row, ending with this one if it has a photo, or else with last week (the
 * week isn't over, so the streak hasn't broken yet). Counted back week by week, each an
 * index lookup, until a week without a photo.
 */
async function countStreak(groupId: string, thisMonday: CalendarDate, timeZone: string) {
  const hasPhotoIn = (monday: CalendarDate) => pulseRepository.hasPhoto(groupId, weekRangeIn(monday, timeZone));

  const thisWeekDone = await hasPhotoIn(thisMonday);
  let weeks = thisWeekDone ? 1 : 0;

  let monday = addDays(thisMonday, -7);
  while (weeks < MAX_STREAK_WEEKS) {
    const batch = Array.from({ length: WEEKS_PER_BATCH }, (_, index) => addDays(monday, -7 * index));
    const results = await Promise.all(batch.map(hasPhotoIn));
    for (const done of results) {
      if (!done) return { weeks, thisWeekDone };
      weeks += 1;
    }
    monday = addDays(monday, -7 * WEEKS_PER_BATCH);
  }
  return { weeks: MAX_STREAK_WEEKS, thisWeekDone };
}

export async function getPulse(groupId: string, userId: string, timeZone: string, now = new Date()): Promise<GroupPulse> {
  await requireMembership(groupId, userId);

  const today = todayIn(timeZone, now);
  const range = monthRangeIn(today.year, today.month, timeZone);
  const [photos, reactions, comments, streak] = await Promise.all([
    pulseRepository.countPhotos(groupId, range),
    pulseRepository.countReactions(groupId, range),
    pulseRepository.countComments(groupId, range),
    countStreak(groupId, weekStartOf(today), timeZone),
  ]);

  return {
    timeZone,
    month: { year: today.year, month: today.month, ...range, photos, reactions, comments },
    streak,
  };
}

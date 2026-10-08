import { logger } from "../../lib/logger.js";
import { pushSender } from "../../lib/push.js";
import { dayRangeIn, isRealDate, isoDate, localTimeIn, yearIn, yearRangeIn } from "../../lib/time-zone.js";
import * as photosRepository from "../photos/photos.repository.js";
import { wantsNotification } from "../settings/settings.dto.js";
import * as wrappedRepository from "../wrapped/wrapped.repository.js";
import * as notificationsRepository from "./notifications.repository.js";
import { deliver, deliverQueued, toRecipient, type Recipient } from "./notifications.service.js";

const RUN_EVERY_MS = 60 * 1000;
/** On This Day goes out from 09:00 local time (later in the day if the server was down then)… */
const ON_THIS_DAY_FROM = 9 * 60;
/** …but not in the evening, when "this day" is nearly over. */
const ON_THIS_DAY_UNTIL = 21 * 60;
/** Wrapped is announced on 1 January from 10:00 local time. */
const WRAPPED_FROM = 10 * 60;

/** "2023, 2024 and 2025" */
function listYears(years: number[]): string {
  const sorted = [...years].sort((a, b) => a - b).map(String);
  return sorted.length > 1 ? `${sorted.slice(0, -1).join(", ")} and ${sorted.at(-1)}` : (sorted[0] ?? "");
}

/**
 * "3 photos from this day in 2025": photos posted on the person's local calendar day in
 * earlier years, in the groups they haven't muted (from people they can see).
 */
async function onThisDayFor(recipient: Recipient, timeZone: string, now: Date): Promise<void> {
  const groups = (await notificationsRepository.listUnmutedGroups(recipient.userId)).map(({ group }) => group.id);
  const spans = await wrappedRepository.findPhotoSpans(groups);
  if (spans.length === 0) return;

  const { date } = localTimeIn(now, timeZone);
  const firstYear = Math.min(...spans.map(({ first }) => yearIn(first, timeZone)));
  const ranges = [];
  for (let year = date.year - 1; year >= firstYear; year--) {
    const day = { ...date, year };
    if (isRealDate(day)) ranges.push({ year, ...dayRangeIn(day, timeZone) });
  }
  if (ranges.length === 0) return;

  const photos = await photosRepository.listPhotoTimesInRanges(groups, recipient.userId, ranges);
  if (photos.length === 0) return;
  const years = ranges
    .filter(({ from, to }) => photos.some(({ createdAt }) => createdAt >= from && createdAt < to))
    .map(({ year }) => year);

  await deliver(
    recipient,
    {
      title: "On this day",
      body: `${photos.length} ${photos.length === 1 ? "photo" : "photos"} from this day in ${listYears(years)}`,
      url: "/memories",
      tag: `on-this-day:${isoDate(date)}`,
    },
    now,
  );
}

/** "Your 2026 Wrapped for The Boys is ready", for each unmuted group with photos last year. */
async function wrappedFor(recipient: Recipient, timeZone: string, year: number, now: Date): Promise<void> {
  const memberships = await notificationsRepository.listUnmutedGroups(recipient.userId);
  for (const { group } of memberships) {
    if (!(await wrappedRepository.hasPhotosBetween(group.id, yearRangeIn(year, timeZone)))) continue;
    await deliver(
      recipient,
      {
        title: `${group.emoji} ${group.name}`,
        body: `Your ${year} Wrapped for ${group.name} is ready`,
        url: `/wrapped/${year}?${new URLSearchParams({ group: group.id })}`,
        tag: `wrapped:${group.id}:${year}`,
      },
      now,
    );
  }
}

/** On This Day and Wrapped, each at most once per person per local day / year. */
async function announceScheduled(now: Date): Promise<void> {
  for (const row of await notificationsRepository.listScheduledRecipients()) {
    const recipient = toRecipient(row.user);
    const timeZone = recipient.settings.timeZone!;
    const { date, minutes } = localTimeIn(now, timeZone);

    try {
      const today = isoDate(date);
      if (
        wantsNotification(recipient.settings, "onThisDay") &&
        minutes >= ON_THIS_DAY_FROM &&
        minutes < ON_THIS_DAY_UNTIL &&
        row.onThisDayCheckedOn !== today &&
        (await notificationsRepository.claimOnThisDay(recipient.userId, today))
      ) {
        await onThisDayFor(recipient, timeZone, now);
      }

      const lastYear = date.year - 1;
      if (
        wantsNotification(recipient.settings, "wrapped") &&
        date.month === 1 &&
        date.day === 1 &&
        minutes >= WRAPPED_FROM &&
        (row.wrappedAnnouncedYear ?? 0) < lastYear &&
        (await notificationsRepository.claimWrappedAnnouncement(recipient.userId, lastYear))
      ) {
        await wrappedFor(recipient, timeZone, lastYear, now);
      }
    } catch (error) {
      logger.error(`Scheduled notifications for user ${recipient.userId} failed`, error);
    }
  }
}

/** One scheduler run: queued notifications whose quiet hours are over, then On This Day and Wrapped. */
export async function runScheduledNotifications(now = new Date()): Promise<void> {
  await deliverQueued(now);
  await announceScheduled(now);
}

/** Runs every minute while push is on. Started from index.ts (never in tests); returns a stop function. */
export function startNotificationScheduler(): () => void {
  if (!pushSender()) {
    logger.info("Push notifications are off (no VAPID keys configured)");
    return () => {};
  }

  let running = false;
  const tick = async () => {
    if (running) return; // the previous run is still going
    running = true;
    try {
      await runScheduledNotifications(new Date());
    } catch (error) {
      logger.error("Notification scheduler run failed", error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), RUN_EVERY_MS);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

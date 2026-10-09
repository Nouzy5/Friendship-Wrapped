import type { UserSummary } from "../auth/types";

/**
 * Something the group is doing right now, or did: "Friday at the lake". For a few hours it is
 * open, and photos posted into it are collected on its page. Not an album: an album is picked
 * together by hand afterwards.
 */
export type Moment = {
  id: string;
  groupId: string;
  title: string;
  /** One emoji, or null. */
  emoji: string | null;
  startsAt: string;
  /** When it closes to new photos (or closed, if that is in the past). */
  endsAt: string;
  /** Still taking photos right now. */
  isOpen: boolean;
  /** Null once the creator's account is gone. */
  createdBy: UserSummary | null;
  photoCount: number;
  /** The newest photo in it. */
  cover: { photoId: string; thumbnailUrl: string } | null;
  /** Ending and deleting it are for its creator and the group owner. */
  canManage: boolean;
};

export type MomentPage = { moments: Moment[]; nextCursor: string | null };

/** How long a moment stays open, in hours. */
export const MOMENT_DURATIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 3, label: "3 hours" },
  { hours: 12, label: "12 hours" },
  { hours: 24, label: "1 day" },
] as const;

export type MomentHours = (typeof MOMENT_DURATIONS)[number]["hours"];
export const DEFAULT_MOMENT_HOURS: MomentHours = 3;

export type NewMoment = { title: string; emoji: string | null; durationHours: MomentHours };

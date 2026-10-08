import type { UserSummary } from "../auth/types";

/** Settings kept with your account (they change what other people see, or what the server sends you). */
export type UserSettings = {
  /** Friends can download the photos you post. */
  allowPhotoSaving: boolean;
  /** Your name and colour appear on Wrapped slides. */
  showInWrapped: boolean;
  /** Your IANA time zone, for quiet hours and morning notifications. */
  timeZone: string | null;
  notifications: NotificationSettings;
};

export type NotificationSettings = {
  enabled: boolean;
  photos: boolean;
  reactions: boolean;
  comments: boolean;
  members: boolean;
  onThisDay: boolean;
  wrapped: boolean;
  /** Times are "HH:MM", 24-hour, in your time zone. */
  quietHours: { enabled: boolean; start: string; end: string };
};

/** Any part of the settings; nested objects can be partial too. */
export type UserSettingsChanges = Partial<Omit<UserSettings, "notifications">> & {
  notifications?: Partial<Omit<NotificationSettings, "quietHours">> & {
    quietHours?: Partial<NotificationSettings["quietHours"]>;
  };
};

/** A device where you're signed in. */
export type SignedInDevice = {
  id: string;
  /** e.g. "Chrome on Windows". */
  device: string;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
};

/** An invite link you made that still works. */
export type MyInvite = {
  id: string;
  group: { id: string; name: string; emoji: string; avatarUrl: string | null };
  createdAt: string;
  expiresAt: string;
};

export type BlockedPerson = UserSummary;

export type ReportInput = { photoId?: string; userId?: string; message: string };

import type { Prisma } from "../../generated/prisma/client.js";

/** The columns behind UserSettings (scheduler bookkeeping left out). */
export const settingsSelect = {
  allowPhotoSaving: true,
  showInWrapped: true,
  timeZone: true,
  notificationsEnabled: true,
  notifyPhotos: true,
  notifyReactions: true,
  notifyComments: true,
  notifyMembers: true,
  notifyOnThisDay: true,
  notifyWrapped: true,
  notifyNudges: true,
  notifyMoments: true,
  quietHoursEnabled: true,
  quietHoursStart: true,
  quietHoursEnd: true,
} satisfies Prisma.UserSettingsSelect;

export type SettingsRow = Prisma.UserSettingsGetPayload<{ select: typeof settingsSelect }>;

/** A missing row means these. Kept in step with the column defaults in schema.prisma. */
const DEFAULTS: SettingsRow = {
  allowPhotoSaving: true,
  showInWrapped: true,
  timeZone: null,
  notificationsEnabled: true,
  notifyPhotos: true,
  notifyReactions: true,
  notifyComments: true,
  notifyMembers: false,
  notifyOnThisDay: true,
  notifyWrapped: true,
  notifyNudges: true,
  notifyMoments: true,
  quietHoursEnabled: true,
  quietHoursStart: "23:00",
  quietHoursEnd: "08:00",
};

/** The event kinds a person can switch notifications on and off for. */
export type NotificationKind = "photos" | "reactions" | "comments" | "members" | "onThisDay" | "wrapped" | "nudges" | "moments";

/** The settings kept on the server. Appearance and camera preferences stay on the device. */
export type UserSettings = {
  /** Whether other members may download your photos. */
  allowPhotoSaving: boolean;
  /** Whether you appear by name in Wrapped (totals count you either way). */
  showInWrapped: boolean;
  /** Your IANA zone, sent by the client; quiet hours and scheduled notifications need it. */
  timeZone: string | null;
  notifications: Record<NotificationKind, boolean> & {
    enabled: boolean;
    /** "HH:MM", 24-hour, in `timeZone`. Notifications during them wait until they end. */
    quietHours: { enabled: boolean; start: string; end: string };
  };
};

export function toUserSettings(row: SettingsRow | null): UserSettings {
  const s = row ?? DEFAULTS;
  return {
    allowPhotoSaving: s.allowPhotoSaving,
    showInWrapped: s.showInWrapped,
    timeZone: s.timeZone,
    notifications: {
      enabled: s.notificationsEnabled,
      photos: s.notifyPhotos,
      reactions: s.notifyReactions,
      comments: s.notifyComments,
      members: s.notifyMembers,
      onThisDay: s.notifyOnThisDay,
      wrapped: s.notifyWrapped,
      nudges: s.notifyNudges,
      moments: s.notifyMoments,
      quietHours: { enabled: s.quietHoursEnabled, start: s.quietHoursStart, end: s.quietHoursEnd },
    },
  };
}

/** True when the person wants notifications of this kind at all. */
export function wantsNotification(settings: UserSettings, kind: NotificationKind): boolean {
  return settings.notifications.enabled && settings.notifications[kind];
}

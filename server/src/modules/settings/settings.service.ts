import { toUserSettings, type UserSettings } from "./settings.dto.js";
import * as settingsRepository from "./settings.repository.js";
import type { UpdateSettingsInput } from "./settings.schemas.js";

export async function getSettings(userId: string): Promise<UserSettings> {
  return toUserSettings(await settingsRepository.findSettings(userId));
}

/** Changes only what's in the input; everything else keeps its value (or default). */
export async function updateSettings(userId: string, input: UpdateSettingsInput): Promise<UserSettings> {
  const n = input.notifications;
  const row = await settingsRepository.upsertSettings(userId, {
    allowPhotoSaving: input.allowPhotoSaving,
    showInWrapped: input.showInWrapped,
    timeZone: input.timeZone,
    notificationsEnabled: n?.enabled,
    notifyPhotos: n?.photos,
    notifyReactions: n?.reactions,
    notifyComments: n?.comments,
    notifyMembers: n?.members,
    notifyOnThisDay: n?.onThisDay,
    notifyWrapped: n?.wrapped,
    notifyNudges: n?.nudges,
    notifyMoments: n?.moments,
    quietHoursEnabled: n?.quietHours?.enabled,
    quietHoursStart: n?.quietHours?.start,
    quietHoursEnd: n?.quietHours?.end,
  });
  return toUserSettings(row);
}

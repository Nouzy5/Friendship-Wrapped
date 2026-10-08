import { apiRequest } from "../../lib/api-client";
import type { User } from "../auth/types";
import type { BlockedPerson, MyInvite, ReportInput, SignedInDevice, UserSettings, UserSettingsChanges } from "./types";

export async function fetchSettings(signal?: AbortSignal): Promise<UserSettings> {
  const { settings } = await apiRequest<{ settings: UserSettings }>("/users/me/settings", { signal });
  return settings;
}

export async function updateSettings(changes: UserSettingsChanges): Promise<UserSettings> {
  const { settings } = await apiRequest<{ settings: UserSettings }>("/users/me/settings", { method: "PATCH", body: changes });
  return settings;
}

export async function updateUsername(username: string): Promise<User> {
  const { user } = await apiRequest<{ user: User }>("/users/me", { method: "PATCH", body: { username } });
  return user;
}

/** Signs out every other device too. */
export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  await apiRequest<null>("/users/me/password", { method: "PUT", body: input });
}

export async function fetchSessions(signal?: AbortSignal): Promise<SignedInDevice[]> {
  const { sessions } = await apiRequest<{ sessions: SignedInDevice[] }>("/users/me/sessions", { signal });
  return sessions;
}

export async function signOutDevice(id: string): Promise<void> {
  await apiRequest<null>(`/users/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Every device except this one. */
export async function signOutOtherDevices(): Promise<void> {
  await apiRequest<null>("/users/me/sessions", { method: "DELETE" });
}

/** Opened as a download, so the browser streams the zip straight to disk. */
export const PHOTO_ARCHIVE_URL = "/api/users/me/photos/archive";

export async function fetchMyInvites(signal?: AbortSignal): Promise<MyInvite[]> {
  const { invites } = await apiRequest<{ invites: MyInvite[] }>("/users/me/invites", { signal });
  return invites;
}

export async function revokeInvite(id: string): Promise<void> {
  await apiRequest<null>(`/users/me/invites/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchBlocked(signal?: AbortSignal): Promise<BlockedPerson[]> {
  const { blocked } = await apiRequest<{ blocked: BlockedPerson[] }>("/users/me/blocks", { signal });
  return blocked;
}

export async function blockPerson(userId: string): Promise<void> {
  await apiRequest<null>(`/users/me/blocks/${encodeURIComponent(userId)}`, { method: "PUT" });
}

export async function unblockPerson(userId: string): Promise<void> {
  await apiRequest<null>(`/users/me/blocks/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export async function sendReport(input: ReportInput): Promise<void> {
  await apiRequest<unknown>("/reports", { method: "POST", body: input });
}

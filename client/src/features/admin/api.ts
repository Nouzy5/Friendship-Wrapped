import { apiRequest } from "../../lib/api-client";

/** What the admin panel's API sends. Dates are ISO strings. Mirrors server/src/modules/admin. */

export type DayCount = { date: string; count: number };

export type Overview = {
  generatedAt: string;
  users: {
    total: number;
    verified: number;
    unverified: number;
    withoutEmail: number;
    newLast7Days: number;
    newLast30Days: number;
    active: { last24Hours: number; last7Days: number; last30Days: number };
  };
  groups: { total: number; createdLast30Days: number };
  content: {
    photos: number;
    videos: number;
    comments: number;
    reactions: number;
    favorites: number;
    albums: number;
    moments: number;
    wrapped: number;
    storageBytes: number;
  };
  safety: { reports: number; reportsLast7Days: number; blocks: number };
  notifications: { webPushSubscriptions: number; iphoneDevices: number; queued: number };
  daily: { signups: DayCount[]; posts: DayCount[] };
};

export type PersonRef = { id: string; username: string; displayName: string };

export type UserRow = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastActiveAt: string | null;
  groupCount: number;
  photoCount: number;
};

export type UserFilter = "all" | "verified" | "unverified" | "no-email";

export type UserPage = { users: UserRow[]; nextCursor: string | null };

export type UserDetail = {
  user: {
    id: string;
    username: string;
    displayName: string;
    email: string | null;
    emailVerified: boolean;
    emailVerifiedAt: string | null;
    isAdmin: boolean;
    hasAvatar: boolean;
    createdAt: string;
  };
  stats: {
    photos: number;
    videos: number;
    comments: number;
    reactionsGiven: number;
    favorites: number;
    albumsCreated: number;
    momentsStarted: number;
    reportsMade: number;
    reportsAgainst: number;
    peopleBlocked: number;
    blockedBy: number;
    storageBytes: number;
  };
  notifications: { webPushSubscriptions: number; iphoneDevices: number };
  groups: {
    id: string;
    name: string;
    emoji: string;
    memberCount: number;
    role: "OWNER" | "MEMBER";
    color: string | null;
    muted: boolean;
    joinedAt: string;
  }[];
  sessions: { id: string; device: string; createdAt: string; lastActiveAt: string }[];
  knownDevices: { label: string; firstSeenAt: string; lastSeenAt: string }[];
  verificationLink: { sentAt: string; expiresAt: string } | null;
};

export type GroupRow = {
  id: string;
  name: string;
  emoji: string;
  createdAt: string;
  memberCount: number;
  photoCount: number;
  lastPostAt: string | null;
  owner: PersonRef | null;
};

export type GroupPage = { groups: GroupRow[]; nextCursor: string | null };

export type GroupDetail = {
  group: { id: string; name: string; emoji: string; createdAt: string };
  members: (PersonRef & { role: "OWNER" | "MEMBER"; color: string | null; muted: boolean; joinedAt: string })[];
  stats: {
    photos: number;
    videos: number;
    comments: number;
    reactions: number;
    albums: number;
    moments: number;
    storageBytes: number;
    activeInvites: number;
    lastPostAt: string | null;
  };
  openMoment: { title: string; emoji: string | null; endsAt: string } | null;
  wrappedYears: number[];
};

export type ReportRow = {
  id: string;
  message: string;
  createdAt: string;
  reporter: PersonRef;
  reportedUser: PersonRef | null;
  photo: {
    id: string;
    caption: string | null;
    kind: "photo" | "video";
    group: { id: string; name: string; emoji: string };
    uploader: { id: string; username: string };
  } | null;
};

export type ReportPage = { reports: ReportRow[]; nextCursor: string | null };

export type CheckStatus = "ok" | "warning" | "error" | "off";

export type SystemCheck = {
  id: string;
  group: "Services" | "Features" | "Data";
  label: string;
  status: CheckStatus;
  detail: string;
};

export type SystemReport = {
  generatedAt: string;
  status: "ok" | "warning" | "error";
  checks: SystemCheck[];
  server: {
    environment: string;
    nodeVersion: string;
    platform: string;
    startedAt: string;
    uptimeSeconds: number;
    memoryMb: { rss: number; heapUsed: number };
  };
  problems: { at: string; level: "warn" | "error"; message: string; detail: string | null }[];
};

export type TestEmailResult = { to: string; delivered: boolean; note: string };

export const fetchOverview = (signal?: AbortSignal) => apiRequest<Overview>("/admin/overview", { signal });

function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const fetchUsers = (params: { q: string; filter: UserFilter; cursor: string | null }, signal?: AbortSignal) =>
  apiRequest<UserPage>(`/admin/users${query({ ...params, limit: 25, filter: params.filter === "all" ? undefined : params.filter })}`, { signal });

export const fetchUser = (userId: string, signal?: AbortSignal) =>
  apiRequest<UserDetail>(`/admin/users/${encodeURIComponent(userId)}`, { signal });

export const markEmailVerified = (userId: string) =>
  apiRequest<UserDetail>(`/admin/users/${encodeURIComponent(userId)}/verify-email`, { method: "POST" });

export const resendVerification = (userId: string) =>
  apiRequest<null>(`/admin/users/${encodeURIComponent(userId)}/resend-verification`, { method: "POST" });

export const signOutEverywhere = (userId: string) =>
  apiRequest<{ signedOut: number }>(`/admin/users/${encodeURIComponent(userId)}/sign-out`, { method: "POST" });

export const deleteUser = (input: { userId: string; confirm: string }) =>
  apiRequest<null>(`/admin/users/${encodeURIComponent(input.userId)}`, { method: "DELETE", body: { confirm: input.confirm } });

export const fetchGroups = (params: { q: string; cursor: string | null }, signal?: AbortSignal) =>
  apiRequest<GroupPage>(`/admin/groups${query({ ...params, limit: 25 })}`, { signal });

export const fetchGroup = (groupId: string, signal?: AbortSignal) =>
  apiRequest<GroupDetail>(`/admin/groups/${encodeURIComponent(groupId)}`, { signal });

export const removeGroupMember = (input: { groupId: string; userId: string }) =>
  apiRequest<{ groupDeleted: boolean }>(
    `/admin/groups/${encodeURIComponent(input.groupId)}/members/${encodeURIComponent(input.userId)}`,
    { method: "DELETE" },
  );

export const deleteGroup = (input: { groupId: string; confirm: string }) =>
  apiRequest<null>(`/admin/groups/${encodeURIComponent(input.groupId)}`, { method: "DELETE", body: { confirm: input.confirm } });

export const fetchReports = (params: { cursor: string | null }, signal?: AbortSignal) =>
  apiRequest<ReportPage>(`/admin/reports${query({ ...params, limit: 25 })}`, { signal });

export const fetchSystem = (signal?: AbortSignal) => apiRequest<SystemReport>("/admin/system", { signal });

export const sendTestEmail = () => apiRequest<TestEmailResult>("/admin/system/test-email", { method: "POST" });

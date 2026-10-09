import { ApiError, apiRequest } from "../../lib/api-client";
import type { Group } from "../groups/types";

export type CreatedInvite = { token: string; expiresAt: string };

/** How long a new link can last. A week unless the creator picks another. */
export const INVITE_LIFETIMES = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
] as const;

export type InviteLifetimeDays = (typeof INVITE_LIFETIMES)[number]["days"];

export const DEFAULT_INVITE_LIFETIME_DAYS: InviteLifetimeDays = 7;

export type InvitePreview = {
  group: { name: string; emoji: string; memberCount: number };
  /** The display name of whoever made the link. */
  invitedBy: string;
  expiresAt: string;
  /** Set when the signed-in viewer already belongs to the group. */
  memberOfGroupId: string | null;
};

/** What an expired link tells whoever opens it: who to ask for a new one. */
export type ExpiredInvite = { invitedBy: string; groupName: string; groupEmoji: string };

/** The sender and group of an expired link, or null for any other error. */
export function expiredInviteFrom(error: unknown): ExpiredInvite | null {
  if (!(error instanceof ApiError) || error.code !== "INVITE_EXPIRED") return null;
  const details = error.details as Partial<ExpiredInvite> | null | undefined;
  if (typeof details?.invitedBy !== "string") return null;
  return {
    invitedBy: details.invitedBy,
    groupName: typeof details.groupName === "string" ? details.groupName : "the group",
    groupEmoji: typeof details.groupEmoji === "string" ? details.groupEmoji : "",
  };
}

const invitePath = (token: string) => `/invites/${encodeURIComponent(token)}`;

export async function createInvite(
  groupId: string,
  lifetimeDays: InviteLifetimeDays = DEFAULT_INVITE_LIFETIME_DAYS,
): Promise<CreatedInvite> {
  const { invite } = await apiRequest<{ invite: CreatedInvite }>(`/groups/${encodeURIComponent(groupId)}/invites`, {
    method: "POST",
    body: { lifetimeDays },
  });
  return invite;
}

export async function resetInvites(groupId: string): Promise<void> {
  await apiRequest<null>(`/groups/${encodeURIComponent(groupId)}/invites`, { method: "DELETE" });
}

export async function fetchInvitePreview(token: string, signal?: AbortSignal): Promise<InvitePreview> {
  const { invite } = await apiRequest<{ invite: InvitePreview }>(invitePath(token), { signal });
  return invite;
}

export async function acceptInvite(token: string): Promise<Group> {
  const { group } = await apiRequest<{ group: Group }>(`${invitePath(token)}/accept`, { method: "POST" });
  return group;
}

import { apiRequest } from "../../lib/api-client";
import type { Group } from "../groups/types";

export type CreatedInvite = { token: string; expiresAt: string };

export type InvitePreview = {
  group: { name: string; emoji: string; memberCount: number };
  expiresAt: string;
  /** Set when the signed-in viewer already belongs to the group. */
  memberOfGroupId: string | null;
};

const invitePath = (token: string) => `/invites/${encodeURIComponent(token)}`;

export async function createInvite(groupId: string): Promise<CreatedInvite> {
  const { invite } = await apiRequest<{ invite: CreatedInvite }>(`/groups/${encodeURIComponent(groupId)}/invites`, {
    method: "POST",
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

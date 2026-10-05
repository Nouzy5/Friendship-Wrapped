import { apiRequest } from "../../lib/api-client";
import type { Group, GroupInput, GroupMember } from "./types";

const groupPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}`;

export async function fetchMyGroups(signal?: AbortSignal): Promise<Group[]> {
  const { groups } = await apiRequest<{ groups: Group[] }>("/groups", { signal });
  return groups;
}

export async function fetchGroup(groupId: string, signal?: AbortSignal): Promise<Group> {
  const { group } = await apiRequest<{ group: Group }>(groupPath(groupId), { signal });
  return group;
}

export async function fetchGroupMembers(groupId: string, signal?: AbortSignal): Promise<GroupMember[]> {
  const { members } = await apiRequest<{ members: GroupMember[] }>(`${groupPath(groupId)}/members`, { signal });
  return members;
}

export async function createGroup(input: GroupInput): Promise<Group> {
  const { group } = await apiRequest<{ group: Group }>("/groups", { method: "POST", body: input });
  return group;
}

export async function updateGroup(groupId: string, input: Partial<GroupInput>): Promise<Group> {
  const { group } = await apiRequest<{ group: Group }>(groupPath(groupId), { method: "PATCH", body: input });
  return group;
}

export function leaveGroup(groupId: string): Promise<{ groupDeleted: boolean }> {
  return apiRequest(`${groupPath(groupId)}/leave`, { method: "POST" });
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  await apiRequest<null>(`${groupPath(groupId)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

import type { Group } from "../groups/types";

/**
 * Which group a new photo goes to by default: the one the camera was opened from, or
 * your only group. With several groups and no hint, nothing is preselected, so a photo
 * is never shared with the wrong friends by accident.
 */
export function defaultShareGroupId(groups: Group[], requestedGroupId: string | null): string | null {
  if (requestedGroupId && groups.some((group) => group.id === requestedGroupId)) return requestedGroupId;
  if (groups.length === 1) return groups[0]!.id;
  return null;
}

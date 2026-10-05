import type { PhotoVariant } from "../../lib/images.js";
import { generateToken } from "../../lib/tokens.js";

/** Everything stored for a group lives under this prefix, so deleting the group can clear it in one sweep. */
export function groupStoragePrefix(groupId: string): string {
  return `groups/${groupId}/`;
}

/** Fresh, unguessable object keys for one photo's renditions. */
export function newPhotoKeys(groupId: string): Record<PhotoVariant, string> {
  const folder = `${groupStoragePrefix(groupId)}photos/${generateToken(16)}/`;
  return {
    full: `${folder}full.webp`,
    medium: `${folder}medium.webp`,
    thumbnail: `${folder}thumbnail.webp`,
  };
}

import type { PhotoVariant } from "../../lib/images.js";
import { generateToken } from "../../lib/tokens.js";

/** Everything stored for a group lives under this prefix, so deleting the group can clear it in one sweep. */
export function groupStoragePrefix(groupId: string): string {
  return `groups/${groupId}/`;
}

/** Fresh, unguessable object keys for one post: its renditions, and the video if it is one. */
export function newPhotoKeys(groupId: string): Record<PhotoVariant, string> & { video: string } {
  const folder = `${groupStoragePrefix(groupId)}photos/${generateToken(16)}/`;
  return {
    full: `${folder}full.webp`,
    medium: `${folder}medium.webp`,
    thumbnail: `${folder}thumbnail.webp`,
    video: `${folder}video.mp4`,
  };
}

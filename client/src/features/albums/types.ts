import type { UserSummary } from "../auth/types";

/** A shared album in a group. */
export type Album = {
  id: string;
  groupId: string;
  name: string;
  createdAt: string;
  /** Null once the creator's account is gone. */
  createdBy: UserSummary | null;
  photoCount: number;
  /** The photo most recently added to the album. */
  cover: { photoId: string; thumbnailUrl: string } | null;
  /** Renaming and deleting are for the album's creator and the group owner. */
  canManage: boolean;
};

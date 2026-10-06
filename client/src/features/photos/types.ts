import type { UserSummary } from "../auth/types";

export type PhotoVariant = "thumbnail" | "medium" | "full";

export type Photo = {
  id: string;
  groupId: string;
  caption: string | null;
  /** Pixel size of the full rendition. */
  width: number;
  height: number;
  /** Upload time. */
  createdAt: string;
  uploader: UserSummary;
  /** Access-checked API URLs; the browser sends the session cookie with them. */
  imageUrls: Record<PhotoVariant, string>;
  canDelete: boolean;
};

/** The photos either side of one in its group feed (newest first); null at either end. */
export type FeedNeighbors = { newerId: string | null; olderId: string | null };

export type PhotoDetail = Photo & {
  group: { id: string; name: string; emoji: string };
  /** Null when you can see the photo but not its group (you posted it, then left). */
  feed: FeedNeighbors | null;
};

export type PhotoPage = { photos: Photo[]; nextCursor: string | null };

export type NewPhoto = { groupId: string; image: Blob; caption: string };

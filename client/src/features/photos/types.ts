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

export type PhotoDetail = Photo & { group: { id: string; name: string; emoji: string } };

export type PhotoPage = { photos: Photo[]; nextCursor: string | null };

export type NewPhoto = { groupId: string; image: Blob; caption: string };

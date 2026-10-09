import type { UserSummary } from "../auth/types";
import type { ReactionSummary } from "../reactions/types";

export type PhotoVariant = "thumbnail" | "medium" | "full";

export type PhotoVideo = {
  /** Access-checked, like the images; supports `Range`, so it plays while it loads and can be scrubbed. */
  url: string;
  durationMs: number;
  sizeBytes: number;
  /** A Live Photo's motion: it plays by itself, muted and looping. */
  isLive: boolean;
};

export type Photo = {
  id: string;
  groupId: string;
  /** The moment it was posted into, if any. */
  momentId: string | null;
  /** A video still has the three images below: its poster frame. */
  kind: "photo" | "video";
  /** Set for a video only. */
  video: PhotoVideo | null;
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
  /** Reacting and commenting are for current members of the photo's group. */
  canInteract: boolean;
  reactions: ReactionSummary;
  commentCount: number;
  /** Your private bookmark. */
  isFavorite: boolean;
  /** Whether you may download it: your own photos, or the uploader allows saving. */
  canSave: boolean;
};

/** The photos either side of one in its group feed (newest first); null at either end. */
export type FeedNeighbors = { newerId: string | null; olderId: string | null };

export type PhotoDetail = Photo & {
  group: { id: string; name: string; emoji: string };
  /** Null when you can see the photo but not its group (you posted it, then left). */
  feed: FeedNeighbors | null;
};

export type PhotoPage = { photos: Photo[]; nextCursor: string | null };

/** A photo (`image`) or a video (`video`) to post. */
export type NewPhoto = {
  groupId: string;
  image?: Blob;
  video?: Blob;
  caption: string;
  /** Post into this moment (one of the group's, still open). */
  momentId?: string;
  /** Called as the upload goes, with the fraction sent (0–1). */
  onProgress?: (fraction: number) => void;
};

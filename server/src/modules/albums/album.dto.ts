import type { Prisma } from "../../generated/prisma/client.js";
import { photoImageUrl } from "../photos/photo.dto.js";
import { toUserSummary, userSummarySelect, type UserSummary } from "../users/user.dto.js";

export const albumSelect = {
  id: true,
  groupId: true,
  name: true,
  createdAt: true,
  createdById: true,
  createdBy: { select: userSummarySelect },
} satisfies Prisma.AlbumSelect;

export type AlbumRow = Prisma.AlbumGetPayload<{ select: typeof albumSelect }>;

export type AlbumView = {
  id: string;
  groupId: string;
  name: string;
  createdAt: Date;
  /** Null once the creator's account is gone. */
  createdBy: UserSummary | null;
  photoCount: number;
  /** The photo most recently added to the album, as a thumbnail. */
  cover: { photoId: string; thumbnailUrl: string } | null;
  /** Renaming and deleting are for the album's creator and the group owner. */
  canManage: boolean;
};

export function toAlbumView(
  album: AlbumRow,
  { photoCount, coverPhotoId, canManage }: { photoCount: number; coverPhotoId: string | undefined; canManage: boolean },
): AlbumView {
  return {
    id: album.id,
    groupId: album.groupId,
    name: album.name,
    createdAt: album.createdAt,
    createdBy: album.createdBy && toUserSummary(album.createdBy),
    photoCount,
    cover: coverPhotoId ? { photoId: coverPhotoId, thumbnailUrl: photoImageUrl(coverPhotoId, "thumbnail") } : null,
    canManage,
  };
}

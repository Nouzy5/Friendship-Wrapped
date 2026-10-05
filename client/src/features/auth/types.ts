/** How a person appears wherever they show up (members, photo uploaders, …). */
export type UserSummary = {
  id: string;
  username: string;
  displayName: string;
  /** Null when they haven't added a profile picture. */
  avatarUrl: string | null;
};

/** A user as the API returns them. */
export type User = UserSummary & {
  createdAt: string;
};

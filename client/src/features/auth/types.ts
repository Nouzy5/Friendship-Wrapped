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
  /** Null for an account made before an email was required: it's asked to add one. */
  email: string | null;
  /** Nobody gets into the app until they've opened the link we emailed. */
  emailVerified: boolean;
  /** Whether the admin panel is open to this person. */
  isAdmin: boolean;
};

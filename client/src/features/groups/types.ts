export type GroupRole = "OWNER" | "MEMBER";

/** A group as seen by the signed-in member. */
export type Group = {
  id: string;
  name: string;
  emoji: string;
  createdAt: string;
  memberCount: number;
  myRole: GroupRole;
};

export type GroupMember = {
  user: { id: string; username: string; displayName: string };
  role: GroupRole;
  joinedAt: string;
};

export type GroupInput = { name: string; emoji: string };

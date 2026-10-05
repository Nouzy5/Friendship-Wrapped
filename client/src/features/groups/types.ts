import type { UserSummary } from "../auth/types";

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
  user: UserSummary;
  role: GroupRole;
  joinedAt: string;
};

export type GroupInput = { name: string; emoji: string };

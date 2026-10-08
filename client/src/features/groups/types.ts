import type { MemberColor } from "../../lib/member-colors";
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
  /** The group photo; null shows the badge (members' colours with the emoji). */
  avatarUrl: string | null;
  /** Your colour here; null only when all 12 are taken. */
  myColor: MemberColor | null;
  /** Muted groups don't send you notifications. */
  muted: boolean;
};

export type GroupMember = {
  user: UserSummary;
  role: GroupRole;
  joinedAt: string;
  color: MemberColor | null;
};

export type GroupInput = { name: string; emoji: string };

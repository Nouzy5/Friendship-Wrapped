import { MemberColor, type GroupRole, type Prisma } from "../../generated/prisma/client.js";
import { apiPath } from "../../lib/api-path.js";
import { sha256Hex } from "../../lib/tokens.js";
import { toUserSummary, userSummarySelect, type UserSummary } from "../users/user.dto.js";

/** The twelve member colours in palette order. */
export const MEMBER_COLORS = Object.values(MemberColor);

/** The first colour nobody in the group has, or null once all twelve are taken. */
export function firstFreeColor(taken: Iterable<MemberColor | null>): MemberColor | null {
  const used = new Set(taken);
  return MEMBER_COLORS.find((color) => !used.has(color)) ?? null;
}

export const groupSummarySelect = {
  id: true,
  name: true,
  emoji: true,
  avatarKey: true,
  createdAt: true,
  _count: { select: { members: true } },
} satisfies Prisma.GroupSelect;

type GroupSummaryRow = Prisma.GroupGetPayload<{ select: typeof groupSummarySelect }>;

/** The viewer's own membership, as their GroupView shows it. */
export const myMembershipSelect = { role: true, color: true, muted: true } satisfies Prisma.GroupMemberSelect;

export type MyMembership = Prisma.GroupMemberGetPayload<{ select: typeof myMembershipSelect }>;

/** A group as seen by one of its members. */
export type GroupView = {
  id: string;
  name: string;
  emoji: string;
  createdAt: Date;
  memberCount: number;
  myRole: GroupRole;
  /** Null once all twelve colours were taken when you joined. */
  myColor: MemberColor | null;
  /** You get no push notifications from a muted group. */
  muted: boolean;
  /** The group photo; null shows the emoji. */
  avatarUrl: string | null;
};

/** Like user avatars: the key never leaves the server, and `v` changes with each new picture. */
export function groupAvatarUrl(groupId: string, avatarKey: string | null): string | null {
  if (!avatarKey) return null;
  return apiPath(`/groups/${groupId}/avatar?v=${sha256Hex(avatarKey).slice(0, 16)}`);
}

export function toGroupView(group: GroupSummaryRow, { role, color, muted }: MyMembership): GroupView {
  return {
    id: group.id,
    name: group.name,
    emoji: group.emoji,
    createdAt: group.createdAt,
    memberCount: group._count.members,
    myRole: role,
    myColor: color,
    muted,
    avatarUrl: groupAvatarUrl(group.id, group.avatarKey),
  };
}

export const groupMemberSelect = {
  role: true,
  color: true,
  joinedAt: true,
  user: { select: userSummarySelect },
} satisfies Prisma.GroupMemberSelect;

type GroupMemberRow = Prisma.GroupMemberGetPayload<{ select: typeof groupMemberSelect }>;

export type GroupMemberView = { role: GroupRole; joinedAt: Date; color: MemberColor | null; user: UserSummary };

export function toGroupMemberView({ role, joinedAt, color, user }: GroupMemberRow): GroupMemberView {
  return { role, joinedAt, color, user: toUserSummary(user) };
}

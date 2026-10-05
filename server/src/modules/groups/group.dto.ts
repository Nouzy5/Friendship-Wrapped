import type { GroupRole, Prisma } from "../../generated/prisma/client.js";

export const groupSummarySelect = {
  id: true,
  name: true,
  emoji: true,
  createdAt: true,
  _count: { select: { members: true } },
} satisfies Prisma.GroupSelect;

type GroupSummaryRow = Prisma.GroupGetPayload<{ select: typeof groupSummarySelect }>;

/** A group as seen by one of its members. */
export type GroupView = {
  id: string;
  name: string;
  emoji: string;
  createdAt: Date;
  memberCount: number;
  myRole: GroupRole;
};

export function toGroupView(group: GroupSummaryRow, myRole: GroupRole): GroupView {
  return {
    id: group.id,
    name: group.name,
    emoji: group.emoji,
    createdAt: group.createdAt,
    memberCount: group._count.members,
    myRole,
  };
}

export const groupMemberSelect = {
  role: true,
  joinedAt: true,
  user: { select: { id: true, username: true, displayName: true } },
} satisfies Prisma.GroupMemberSelect;

export type GroupMemberView = Prisma.GroupMemberGetPayload<{ select: typeof groupMemberSelect }>;

import { Avatar } from "../../../components/ui/Avatar";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import type { GroupMember } from "../types";

type MemberListProps = {
  members: GroupMember[];
  currentUserId: string;
  /** Present only for the owner; shows a Remove button on everyone else. */
  onRemove?: (member: GroupMember) => void;
};

export function MemberList({ members, currentUserId, onRemove }: MemberListProps) {
  return (
    <ul className="divide-y divide-ink-700/70">
      {members.map((member) => {
        const isYou = member.user.id === currentUserId;
        return (
          <li key={member.user.id} className="flex items-center gap-3 py-3">
            <Avatar name={member.user.displayName} seed={member.user.id} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink-50">
                {member.user.displayName}
                {isYou && <span className="font-normal text-ink-400"> (you)</span>}
              </p>
              <p className="truncate text-sm text-ink-400">@{member.user.username}</p>
            </div>
            {member.role === "OWNER" && <Badge>Owner</Badge>}
            {onRemove && !isYou && (
              <Button
                variant="ghost"
                className="min-h-9 px-3 text-xs"
                onClick={() => onRemove(member)}
                aria-label={`Remove ${member.user.displayName}`}
              >
                Remove
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

import { Avatar } from "../../../components/ui/Avatar";
import type { GroupMember } from "../types";

const MAX_SHOWN = 5;

/** Overlapping avatar stack. Decorative: pair it with a text member count. */
export function MemberAvatars({ members }: { members: GroupMember[] }) {
  const shown = members.slice(0, MAX_SHOWN);
  const hidden = members.length - shown.length;

  return (
    <div aria-hidden className="flex -space-x-2">
      {shown.map((member) => (
        <span key={member.user.id} className="rounded-full ring-2 ring-ink-950">
          <Avatar name={member.user.displayName} seed={member.user.id} src={member.user.avatarUrl} size="sm" />
        </span>
      ))}
      {hidden > 0 && (
        <span className="grid size-8 place-items-center rounded-full bg-ink-700 text-xs font-semibold text-ink-200 ring-2 ring-ink-950">
          +{hidden}
        </span>
      )}
    </div>
  );
}

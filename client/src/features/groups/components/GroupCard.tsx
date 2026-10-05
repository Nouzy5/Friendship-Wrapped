import { Link } from "react-router";
import { ChevronRightIcon } from "../../../components/ui/icons";
import { formatMemberCount } from "../../../lib/format";
import type { Group } from "../types";
import { GroupEmoji } from "./GroupEmoji";

export function GroupCard({ group }: { group: Group }) {
  return (
    <Link
      to={`/groups/${group.id}`}
      className="flex items-center gap-4 rounded-3xl border border-ink-700/70 bg-ink-900/80 p-4 transition hover:border-ink-700 hover:bg-ink-800/80"
    >
      <GroupEmoji emoji={group.emoji} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink-50">{group.name}</p>
        <p className="text-sm text-ink-400">
          {formatMemberCount(group.memberCount)}
          {group.myRole === "OWNER" && " · Owner"}
        </p>
      </div>
      <ChevronRightIcon className="size-5 text-ink-400" />
    </Link>
  );
}

import { Link } from "react-router";
import { buttonClasses } from "../components/ui/Button";
import { PlusIcon, SettingsIcon } from "../components/ui/icons";
import { headerIconLinkClasses, PageHeader } from "../components/ui/PageHeader";
import { GroupEmoji } from "../features/groups/components/GroupEmoji";
import { useGroupContext } from "../features/groups/components/GroupRoute";
import { MemberAvatars } from "../features/groups/components/MemberAvatars";
import { useGroupMembers } from "../features/groups/hooks";
import { InviteFriendsCard } from "../features/invites/components/InviteFriendsCard";
import { GroupFeed } from "../features/photos/components/GroupFeed";
import { formatMemberCount } from "../lib/format";
import { usePageTitle } from "../lib/usePageTitle";

export function GroupPage() {
  const group = useGroupContext();
  usePageTitle(group.name);
  const members = useGroupMembers(group.id);
  const membersPath = `/groups/${group.id}/members`;
  const alone = group.memberCount === 1;

  return (
    <div className="flex flex-col gap-6 py-2">
      <PageHeader
        backTo="/home"
        backLabel="Back to home"
        action={
          <Link to={`/groups/${group.id}/settings`} aria-label="Group settings" className={headerIconLinkClasses}>
            <SettingsIcon className="size-5" />
          </Link>
        }
      />

      <section className="flex flex-col items-center text-center">
        <GroupEmoji emoji={group.emoji} size="xl" />
        <h1 className="mt-4 text-3xl font-black tracking-tight wrap-anywhere">{group.name}</h1>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
          <Link
            to={membersPath}
            className="inline-flex items-center gap-3 rounded-full py-1 pr-3 pl-1 text-sm text-ink-200 transition hover:bg-ink-800"
          >
            {members.data && <MemberAvatars members={members.data} />}
            {formatMemberCount(group.memberCount)}
          </Link>
          {/* The feed scrolls on and on, so invites live on the members page rather than below it. */}
          {!alone && (
            <Link to={membersPath} className={buttonClasses("ghost", "min-h-10 px-3 text-xs")}>
              <PlusIcon className="size-4" />
              Invite
            </Link>
          )}
        </div>
      </section>

      {/* Until there's someone to share photos with, inviting comes first. */}
      {alone && <InviteFriendsCard group={group} highlight />}
      <GroupFeed groupId={group.id} />
    </div>
  );
}

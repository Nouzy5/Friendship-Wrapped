import { Link } from "react-router";
import { SettingsIcon } from "../components/ui/icons";
import { headerIconLinkClasses, PageHeader } from "../components/ui/PageHeader";
import { GroupEmoji } from "../features/groups/components/GroupEmoji";
import { useGroupContext } from "../features/groups/components/GroupRoute";
import { MemberAvatars } from "../features/groups/components/MemberAvatars";
import { useGroupMembers } from "../features/groups/hooks";
import { InviteFriendsCard } from "../features/invites/components/InviteFriendsCard";
import { GroupPhotos } from "../features/photos/components/GroupPhotos";
import { formatMemberCount } from "../lib/format";

export function GroupPage() {
  const group = useGroupContext();
  const members = useGroupMembers(group.id);
  const alone = group.memberCount === 1;
  const invite = <InviteFriendsCard group={group} highlight={alone} />;

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
        <h1 className="mt-4 text-3xl font-black tracking-tight">{group.name}</h1>
        <Link
          to={`/groups/${group.id}/members`}
          className="mt-3 inline-flex items-center gap-3 rounded-full py-1 pr-3 pl-1 text-sm text-ink-200 transition hover:bg-ink-800"
        >
          {members.data && <MemberAvatars members={members.data} />}
          {formatMemberCount(group.memberCount)}
        </Link>
      </section>

      {/* Inviting comes first until there's someone to share photos with. */}
      {alone && invite}
      <GroupPhotos groupId={group.id} />
      {!alone && invite}
    </div>
  );
}

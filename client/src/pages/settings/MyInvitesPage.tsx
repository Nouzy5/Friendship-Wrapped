import { Alert } from "../../components/ui/Alert";
import { PageHeader } from "../../components/ui/PageHeader";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { SettingsGroup, SettingsValue } from "../../components/ui/SettingsList";
import { StateMessage } from "../../components/ui/StateMessage";
import { GroupAvatar } from "../../features/groups/components/GroupAvatar";
import { useMyInvites, useRevokeInvite } from "../../features/settings/hooks";
import { formatDayMonth } from "../../lib/format";
import { usePageTitle } from "../../lib/usePageTitle";

/** Invite links you've made that still work, so you can switch off one you shared by mistake. */
export function MyInvitesPage() {
  usePageTitle("Invite links");
  const invites = useMyInvites();
  const revoke = useRevokeInvite();

  let content;
  if (invites.isPending) content = <ListSkeleton rows={2} />;
  else if (invites.isLoadingError) content = <Alert>Couldn't load your invite links. Check your connection.</Alert>;
  else if (invites.data.length === 0)
    content = <StateMessage emoji="🔗" title="No working links" description="Invite links you make in a group's settings show up here until they expire." />;
  else
    content = (
      <SettingsGroup>
        {invites.data.map((invite) => (
          <SettingsValue
            key={invite.id}
            leading={<GroupAvatar group={invite.group} size={36} />}
            label={invite.group.name}
            description={`Works until ${formatDayMonth(invite.expiresAt)}`}
            trailing={
              <button
                type="button"
                aria-label={`Turn off the invite link for ${invite.group.name}`}
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(invite.id)}
                className="h-11 shrink-0 rounded-full px-3 text-[0.9375rem] font-semibold transition hover:bg-line"
              >
                Turn off
              </button>
            }
          />
        ))}
      </SettingsGroup>
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Invite links"
        subtitle="Anyone with one of these links can join the group until it expires."
        backTo="/settings/privacy"
        backLabel="Back to privacy and safety"
      />
      {content}
    </div>
  );
}

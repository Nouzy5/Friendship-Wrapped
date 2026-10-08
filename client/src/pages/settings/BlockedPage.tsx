import { Alert } from "../../components/ui/Alert";
import { Avatar } from "../../components/ui/Avatar";
import { PageHeader } from "../../components/ui/PageHeader";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { SettingsGroup, SettingsValue } from "../../components/ui/SettingsList";
import { StateMessage } from "../../components/ui/StateMessage";
import { useBlocked, useUnblockPerson } from "../../features/settings/hooks";
import { usePageTitle } from "../../lib/usePageTitle";

export function BlockedPage() {
  usePageTitle("Blocked people");
  const blocked = useBlocked();
  const unblock = useUnblockPerson();

  let content;
  if (blocked.isPending) content = <ListSkeleton rows={2} />;
  else if (blocked.isLoadingError) content = <Alert>Couldn't load who you've blocked. Check your connection.</Alert>;
  else if (blocked.data.length === 0)
    content = <StateMessage emoji="🕊️" title="Nobody's blocked" description="You can block someone from the menu on any of their photos." />;
  else
    content = (
      <SettingsGroup>
        {blocked.data.map((person) => (
          <SettingsValue
            key={person.id}
            leading={<Avatar name={person.displayName} src={person.avatarUrl} size="md" />}
            label={person.displayName}
            description={`@${person.username}`}
            trailing={
              <button
                type="button"
                aria-label={`Unblock ${person.displayName}`}
                disabled={unblock.isPending}
                onClick={() => unblock.mutate(person.id)}
                className="h-11 shrink-0 rounded-full px-3 text-[0.9375rem] font-semibold transition hover:bg-line"
              >
                Unblock
              </button>
            }
          />
        ))}
      </SettingsGroup>
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Blocked people" backTo="/settings/privacy" backLabel="Back to privacy and safety" />
      {content}
    </div>
  );
}

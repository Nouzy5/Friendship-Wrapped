import { Link } from "react-router";
import { Button, buttonClasses } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PlusIcon } from "../components/ui/icons";
import { StateMessage } from "../components/ui/StateMessage";
import { useCurrentUser } from "../features/auth/hooks";
import { GroupCard } from "../features/groups/components/GroupCard";
import { useMyGroups } from "../features/groups/hooks";
import { usePageTitle } from "../lib/usePageTitle";
import { ListSkeleton } from "../components/ui/Skeleton";

function GroupList() {
  const groups = useMyGroups();

  if (groups.isPending) return <ListSkeleton rows={2} card />;

  if (groups.isLoadingError) {
    return (
      <Card>
        <StateMessage
          emoji="📡"
          title="Couldn't load your groups"
          description="Check your connection and try again."
          action={<Button onClick={() => void groups.refetch()}>Try again</Button>}
        />
      </Card>
    );
  }

  if (groups.data.length === 0) {
    return (
      <Card>
        <StateMessage
          emoji="🫶"
          title="No groups yet"
          description="Create a group for your friends, then send them an invite link. Got a link from a friend? Just open it."
          action={
            <Link to="/groups/new" className={buttonClasses()}>
              Create a group
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {groups.data.map((group) => (
        <li key={group.id}>
          <GroupCard group={group} />
        </li>
      ))}
    </ul>
  );
}

export function HomePage() {
  usePageTitle("Home");
  const user = useCurrentUser();
  const firstName = user.displayName.split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-6 py-2">
      <div>
        <h1 className="text-3xl font-black tracking-tight wrap-break-word">Hey {firstName} 👋</h1>
        <p className="mt-1 text-ink-200">Good to have you here.</p>
      </div>

      <section aria-labelledby="groups-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="groups-heading" className="text-sm font-semibold tracking-wide text-ink-200 uppercase">
            Your groups
          </h2>
          <Link to="/groups/new" className={buttonClasses("ghost", "min-h-10 px-3 text-xs")}>
            <PlusIcon className="size-4" />
            New group
          </Link>
        </div>
        <GroupList />
      </section>
    </div>
  );
}

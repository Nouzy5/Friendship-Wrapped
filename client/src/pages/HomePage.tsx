import { Link, Navigate } from "react-router";
import { AppMark } from "../components/AppMark";
import { Button, buttonClasses } from "../components/ui/Button";
import { FeedSkeleton } from "../components/ui/Skeleton";
import { StateMessage } from "../components/ui/StateMessage";
import { useCurrentUser } from "../features/auth/hooks";
import { useCurrentGroup } from "../features/groups/current-group";
import { useMyGroups } from "../features/groups/hooks";
import { usePageTitle } from "../lib/usePageTitle";

/** Home opens the group you were last looking at. Without any groups yet, it explains how to start one. */
export function HomePage() {
  usePageTitle("Home");
  const user = useCurrentUser();
  const groups = useMyGroups();
  const current = useCurrentGroup();
  const firstName = user.displayName.split(/\s+/)[0];

  if (current) return <Navigate to={`/groups/${current.id}`} replace />;

  if (groups.isLoadingError) {
    return (
      <StateMessage
        headingLevel="h1"
        emoji="📡"
        title="Couldn't load your groups"
        description="Check your connection and try again."
        action={<Button onClick={() => void groups.refetch()}>Try again</Button>}
      />
    );
  }

  if (current === undefined) {
    return (
      <div className="px-2 pt-16">
        <FeedSkeleton count={1} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-6 pt-16 text-center">
      <AppMark size={72} />
      <h1 className="mt-6 text-[2rem] leading-tight font-semibold font-stretch-112%">Hey {firstName}</h1>
      <p className="mt-2 max-w-xs text-[0.9375rem] text-sub">
        Make a group for your friends, then send them an invite link. Got a link from a friend? Just open it.
      </p>
      <Link to="/groups/new" className={buttonClasses("primary", "mt-8")}>
        Create a group
      </Link>
    </div>
  );
}

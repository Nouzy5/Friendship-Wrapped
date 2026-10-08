import { Link, Outlet, useOutletContext, useParams } from "react-router";
import { Button, buttonClasses } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { StateMessage } from "../../../components/ui/StateMessage";
import { isNotFoundError } from "../../../lib/api-client";
import { useGroup } from "../hooks";
import type { Group } from "../types";

/**
 * Layout route for /groups/:groupId/*. Loads the group once and hands it to child
 * pages; non-members (or removed members) get a "not found" screen.
 */
export function GroupRoute() {
  const { groupId = "" } = useParams();
  const group = useGroup(groupId);

  if (group.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // A refetch that finds it gone (deleted, or you've been removed) counts too, even with the group cached.
  if (group.isLoadingError || (group.isRefetchError && isNotFoundError(group.error))) {
    return isNotFoundError(group.error) ? (
      <StateMessage
        headingLevel="h1"
        emoji="🔒"
        title="Group not found"
        description="It may have been deleted, or you're no longer a member."
        action={
          <Link to="/home" className={buttonClasses("secondary")}>
            Back to home
          </Link>
        }
      />
    ) : (
      <StateMessage
        headingLevel="h1"
        emoji="📡"
        title="Couldn't load this group"
        description="Check your connection and try again."
        action={<Button onClick={() => void group.refetch()}>Try again</Button>}
      />
    );
  }

  return <Outlet context={group.data} />;
}

/** The current group, for pages rendered inside <GroupRoute>. */
export function useGroupContext(): Group {
  return useOutletContext<Group>();
}

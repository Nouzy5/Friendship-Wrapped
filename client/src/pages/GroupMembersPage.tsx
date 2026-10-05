import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { StateMessage } from "../components/ui/StateMessage";
import { useCurrentUser } from "../features/auth/hooks";
import { useGroupContext } from "../features/groups/components/GroupRoute";
import { MemberList } from "../features/groups/components/MemberList";
import { useGroupMembers, useRemoveMember } from "../features/groups/hooks";
import type { GroupMember } from "../features/groups/types";
import { InviteFriendsCard } from "../features/invites/components/InviteFriendsCard";
import { getFormError } from "../lib/form-errors";

export function GroupMembersPage() {
  const group = useGroupContext();
  const user = useCurrentUser();
  const members = useGroupMembers(group.id);
  const removeMember = useRemoveMember(group.id);
  const [toRemove, setToRemove] = useState<GroupMember | null>(null);

  const isOwner = group.myRole === "OWNER";

  function closeDialog() {
    setToRemove(null);
    removeMember.reset();
  }

  return (
    <div className="flex flex-col gap-6 py-2">
      <PageHeader title="Members" backTo={`/groups/${group.id}`} backLabel={`Back to ${group.name}`} />

      <Card>
        {members.isPending ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : members.isError ? (
          <StateMessage
            emoji="📡"
            title="Couldn't load members"
            action={<Button onClick={() => void members.refetch()}>Try again</Button>}
          />
        ) : (
          <MemberList
            members={members.data}
            currentUserId={user.id}
            onRemove={isOwner ? setToRemove : undefined}
          />
        )}
      </Card>

      <InviteFriendsCard group={group} />

      <ConfirmDialog
        open={toRemove !== null}
        title={`Remove ${toRemove?.user.displayName ?? "member"}?`}
        description="They'll lose access to this group straight away. They can only come back with a new invite link."
        confirmLabel="Remove"
        pendingLabel="Removing…"
        variant="danger"
        isPending={removeMember.isPending}
        error={getFormError(removeMember.error)}
        onClose={closeDialog}
        onConfirm={() => {
          if (toRemove) removeMember.mutate(toRemove.user.id, { onSuccess: closeDialog });
        }}
      />
    </div>
  );
}

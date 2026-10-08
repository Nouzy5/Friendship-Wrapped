import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { PageHeader } from "../components/ui/PageHeader";
import { GroupForm } from "../features/groups/components/GroupForm";
import { useGroupContext } from "../features/groups/components/GroupRoute";
import { useLeaveGroup, useUpdateGroup } from "../features/groups/hooks";
import type { Group } from "../features/groups/types";
import { useResetInvites } from "../features/invites/hooks";
import { getFormError } from "../lib/form-errors";
import { toast } from "../lib/toast";
import { usePageTitle } from "../lib/usePageTitle";

function leaveConsequence(group: Group): string {
  if (group.memberCount === 1) return "You're the only member, so leaving will permanently delete this group.";
  if (group.myRole === "OWNER") return "Ownership will pass to the member who has been in the group longest.";
  return "You'll lose access to this group until someone sends you a new invite link.";
}

const sectionHeadingClasses = "text-sm font-semibold tracking-wide text-ink-200 uppercase";

function EditGroupCard({ group }: { group: Group }) {
  const updateGroup = useUpdateGroup(group.id);

  return (
    <Card>
      <h2 className={`${sectionHeadingClasses} mb-4`}>Edit group</h2>
      <GroupForm
        initialValues={{ name: group.name, emoji: group.emoji }}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        isPending={updateGroup.isPending}
        error={updateGroup.error}
        statusMessage={updateGroup.isSuccess ? "Saved" : undefined}
        onEdit={() => {
          if (updateGroup.isSuccess) updateGroup.reset();
        }}
        onSubmit={(input) => updateGroup.mutate(input)}
      />
    </Card>
  );
}

function ResetInvitesCard({ group }: { group: Group }) {
  const resetInvites = useResetInvites(group.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      <h2 className={sectionHeadingClasses}>Invite links</h2>
      <p className="mt-2 text-sm text-ink-200">
        If a link ended up somewhere it shouldn't, reset them. Every existing invite link stops working.
      </p>
      {resetInvites.isSuccess && (
        <p role="status" className="mt-3 text-sm text-success">
          All invite links have been reset.
        </p>
      )}
      <Button variant="secondary" className="mt-4 w-full" onClick={() => setConfirming(true)}>
        Reset invite links
      </Button>

      <ConfirmDialog
        open={confirming}
        title="Reset all invite links?"
        description="Links that have already been shared will stop working. Members can create new ones."
        confirmLabel="Reset links"
        pendingLabel="Resetting…"
        variant="danger"
        isPending={resetInvites.isPending}
        error={getFormError(resetInvites.error)}
        onClose={() => setConfirming(false)}
        onConfirm={() => resetInvites.mutate(undefined, { onSuccess: () => setConfirming(false) })}
      />
    </Card>
  );
}

function LeaveGroupCard({ group }: { group: Group }) {
  const leaveGroup = useLeaveGroup(group.id);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      <h2 className={sectionHeadingClasses}>Leave group</h2>
      <p className="mt-2 text-sm text-ink-200">{leaveConsequence(group)}</p>
      <Button variant="danger" className="mt-4 w-full wrap-anywhere" onClick={() => setConfirming(true)}>
        Leave {group.name}
      </Button>

      <ConfirmDialog
        open={confirming}
        title={`Leave ${group.name}?`}
        description={leaveConsequence(group)}
        confirmLabel={group.memberCount === 1 ? "Leave and delete" : "Leave group"}
        pendingLabel="Leaving…"
        variant="danger"
        isPending={leaveGroup.isPending}
        error={getFormError(leaveGroup.error)}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          leaveGroup.mutate(undefined, {
            // The server says what happened: the member count shown may be out of date.
            onSuccess: ({ groupDeleted }) => {
              toast(groupDeleted ? `${group.name} was deleted` : `You left ${group.name}`);
              void navigate("/home", { replace: true });
            },
          })
        }
      />
    </Card>
  );
}

export function GroupSettingsPage() {
  const group = useGroupContext();
  usePageTitle(`Settings · ${group.name}`);
  const isOwner = group.myRole === "OWNER";

  return (
    <div className="flex flex-col gap-6 py-2">
      <PageHeader title="Group settings" backTo={`/groups/${group.id}`} backLabel={`Back to ${group.name}`} />

      {isOwner && <EditGroupCard group={group} />}
      {isOwner && <ResetInvitesCard group={group} />}
      <LeaveGroupCard group={group} />
    </div>
  );
}

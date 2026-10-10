import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Alert } from "../../components/ui/Alert";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ChevronLeftIcon } from "../../components/ui/icons";
import { Skeleton } from "../../components/ui/Skeleton";
import { StateMessage } from "../../components/ui/StateMessage";
import type { GroupDetail } from "../../features/admin/api";
import { Facts, Section, StatCard } from "../../features/admin/components/AdminUi";
import { TypeToConfirmDialog } from "../../features/admin/components/TypeToConfirmDialog";
import { useAdminGroup, useDeleteGroup, useRemoveGroupMember } from "../../features/admin/hooks";
import { isNotFoundError } from "../../lib/api-client";
import { formatBytes, formatDateTime, formatRelativeTime, nounFor } from "../../lib/format";
import { getFormError } from "../../lib/form-errors";
import { toast } from "../../lib/toast";
import { usePageTitle } from "../../lib/usePageTitle";

type Member = GroupDetail["members"][number];

function Loaded({ detail }: { detail: GroupDetail }) {
  const navigate = useNavigate();
  const { group, stats, members } = detail;
  usePageTitle(`Admin · ${group.name}`);

  const removeMember = useRemoveGroupMember();
  const remove = useDeleteGroup();
  const [removing, setRemoving] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link to="/admin/groups" state={{ back: true }} className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-[0.9375rem] font-semibold text-sub hover:text-fg">
          <ChevronLeftIcon className="size-5" />
          Groups
        </Link>
        <div className="flex items-center gap-4">
          <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-2xl bg-surface text-4xl">
            {group.emoji}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-[2rem] leading-tight font-semibold font-stretch-112% wrap-anywhere">{group.name}</h1>
            <p className="text-sub">
              {members.length} {nounFor(members.length, "member")} · created {formatRelativeTime(group.createdAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <Card className="rounded-[1.25rem] p-4">
            <Facts
              items={[
                { label: "Created", value: formatDateTime(group.createdAt) },
                { label: "Last post", value: stats.lastPostAt ? formatRelativeTime(stats.lastPostAt) : "Nothing posted yet" },
                {
                  label: "Open moment",
                  value: detail.openMoment ? `${detail.openMoment.emoji ?? ""} ${detail.openMoment.title}, until ${formatDateTime(detail.openMoment.endsAt)}` : "None",
                },
                {
                  label: "Wrapped saved for",
                  value: detail.wrappedYears.length > 0 ? detail.wrappedYears.join(", ") : "No year yet",
                },
                { label: "Invite links in use", value: stats.activeInvites },
                { label: "Group id", value: <code className="text-sm">{group.id}</code> },
              ]}
            />
          </Card>

          <Section title="Activity">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard label="Photos" value={stats.photos} />
              <StatCard label="Videos" value={stats.videos} />
              <StatCard label="Storage" value={formatBytes(stats.storageBytes)} />
              <StatCard label="Comments" value={stats.comments} />
              <StatCard label="Reactions" value={stats.reactions} />
              <StatCard label="Albums and moments" value={`${stats.albums} · ${stats.moments}`} />
            </div>
          </Section>

          <Section title={`Members (${members.length})`}>
            {removeMember.isError && <Alert>{getFormError(removeMember.error)}</Alert>}
            <ul className="flex flex-col gap-2">
              {members.map((member) => (
                <li key={member.id} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                  <Avatar name={member.displayName} size="md" />
                  <Link to={`/admin/users/${member.id}`} className="flex min-w-0 flex-1 flex-col hover:underline">
                    <span className="truncate font-semibold">{member.displayName}</span>
                    <span className="truncate text-sm text-sub">
                      @{member.username} · joined {formatRelativeTime(member.joinedAt)}
                      {member.muted ? " · muted" : ""}
                    </span>
                  </Link>
                  {member.role === "OWNER" && <Badge>Owner</Badge>}
                  <Button variant="ghost" className="min-h-11 px-3" onClick={() => setRemoving(member)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Card className="flex flex-col gap-3 rounded-[1.25rem] p-4">
          <h2 className="text-base font-semibold">Actions</h2>
          <Button variant="danger" onClick={() => setDeleting(true)}>
            Delete group…
          </Button>
          <p className="text-[0.8125rem] text-sub">
            Deletes the group with all its photos, videos, comments and albums. Its members stay, and keep their other groups.
          </p>
        </Card>
      </div>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => {
          removeMember.reset();
          setRemoving(null);
        }}
        title={removing ? `Remove ${removing.displayName}?` : "Remove"}
        description={
          removing?.role === "OWNER"
            ? "They own this group, so it passes to the longest-standing member (or is deleted, if they're the last)."
            : "They leave the group the way they would by tapping “Leave group”. Their photos stay with it, and its invite links stop working."
        }
        confirmLabel="Remove"
        pendingLabel="Removing…"
        isPending={removeMember.isPending}
        error={getFormError(removeMember.error)}
        onConfirm={() => {
          if (!removing) return;
          removeMember.mutate(
            { groupId: group.id, userId: removing.id },
            {
              onSuccess: ({ groupDeleted }) => {
                setRemoving(null);
                if (groupDeleted) {
                  toast("That was the last member, so the group was deleted");
                  void navigate("/admin/groups", { replace: true });
                } else {
                  toast(`Removed ${removing.displayName}`);
                }
              },
            },
          );
        }}
      />

      <TypeToConfirmDialog
        open={deleting}
        onClose={() => {
          remove.reset();
          setDeleting(false);
        }}
        title={`Delete ${group.name}?`}
        description={`This deletes ${stats.photos + stats.videos} posts, ${stats.comments} comments and every album and moment in the group. It can't be undone.`}
        expected={group.name}
        confirmLabel="Delete group"
        pendingLabel="Deleting…"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={(typed) =>
          remove.mutate(
            { groupId: group.id, confirm: typed },
            {
              onSuccess: () => {
                toast(`Deleted ${group.name}`);
                void navigate("/admin/groups", { replace: true });
              },
            },
          )
        }
      />
    </div>
  );
}

export function AdminGroupPage() {
  const { groupId = "" } = useParams();
  const detail = useAdminGroup(groupId);

  if (detail.isPending) {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-4">
        <Skeleton className="h-16 w-2/3 rounded-2xl" />
        <Skeleton className="h-40 rounded-[1.25rem]" />
        <Skeleton className="h-40 rounded-[1.25rem]" />
      </div>
    );
  }

  if (detail.isError) {
    return isNotFoundError(detail.error) ? (
      <StateMessage
        emoji="🔍"
        title="No such group"
        description="It may have been deleted, or this id is wrong."
        action={
          <Link to="/admin/groups" className="font-semibold underline">
            Back to groups
          </Link>
        }
      />
    ) : (
      <Alert>Couldn't load this group: {getFormError(detail.error)}</Alert>
    );
  }

  return <Loaded detail={detail.data} />;
}

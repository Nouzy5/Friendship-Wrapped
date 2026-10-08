import { useState } from "react";
import { useNavigate } from "react-router";
import { Alert } from "../components/ui/Alert";
import { Avatar } from "../components/ui/Avatar";
import { Button, buttonClasses } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dialog } from "../components/ui/Dialog";
import { FileButton } from "../components/ui/FileButton";
import { BlockIcon, FlagIcon, MoreIcon, TrashIcon } from "../components/ui/icons";
import { Menu, type MenuItem } from "../components/ui/Menu";
import { PageHeader } from "../components/ui/PageHeader";
import { ListSkeleton } from "../components/ui/Skeleton";
import { SettingsButton, SettingsGroup, SettingsSection, SettingsSwitch, SettingsValue } from "../components/ui/SettingsList";
import { useCurrentUser } from "../features/auth/hooks";
import { GroupAvatar } from "../features/groups/components/GroupAvatar";
import { GroupForm } from "../features/groups/components/GroupForm";
import { useGroupContext } from "../features/groups/components/GroupRoute";
import {
  useGroupMembers,
  useLeaveGroup,
  useRemoveGroupAvatar,
  useRemoveMember,
  useUpdateGroup,
  useUpdateMyMembership,
  useUploadGroupAvatar,
} from "../features/groups/hooks";
import type { Group, GroupMember } from "../features/groups/types";
import { InviteFriendsCard } from "../features/invites/components/InviteFriendsCard";
import { useResetInvites } from "../features/invites/hooks";
import { ReportDialog } from "../features/settings/components/ReportDialog";
import { useBlockPerson } from "../features/settings/hooks";
import { ApiError } from "../lib/api-client";
import { getFormError } from "../lib/form-errors";
import { formatMemberCount, formatMonthYear } from "../lib/format";
import { IMAGE_ACCEPT, imageFileError } from "../lib/image-files";
import { MEMBER_COLORS, MEMBER_PALETTE, type MemberColor } from "../lib/member-colors";
import { toast } from "../lib/toast";
import { usePageTitle } from "../lib/usePageTitle";

function leaveConsequence(group: Group): string {
  if (group.memberCount === 1) return "You're the only member, so leaving will permanently delete this group.";
  if (group.myRole === "OWNER") return "Ownership will pass to the member who has been in the group longest.";
  return "You'll lose access to this group until someone sends you a new invite link.";
}

/** The group's picture and name at the top; the owner can set a group photo. */
function GroupHeader({ group }: { group: Group }) {
  const upload = useUploadGroupAvatar(group.id);
  const remove = useRemoveGroupAvatar(group.id);
  const [fileError, setFileError] = useState<string | null>(null);
  const isOwner = group.myRole === "OWNER";
  const busy = upload.isPending || remove.isPending;
  const error = fileError ?? getFormError(upload.error) ?? getFormError(remove.error);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <GroupAvatar group={group} size={76} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-[1.875rem] leading-tight font-semibold font-stretch-112% wrap-anywhere">{group.name}</h1>
          <span className="text-sm text-sub">
            {formatMemberCount(group.memberCount)}, together since {formatMonthYear(group.createdAt)}
          </span>
        </div>
      </div>
      {isOwner && (
        <div className="flex flex-wrap items-center gap-2">
          <FileButton
            accept={IMAGE_ACCEPT}
            disabled={busy}
            className={buttonClasses("secondary", "min-h-11 px-4")}
            onFile={(file) => {
              remove.reset();
              const problem = imageFileError(file);
              setFileError(problem);
              if (!problem) upload.mutate(file);
            }}
          >
            {upload.isPending ? "Uploading…" : group.avatarUrl ? "Change group photo" : "Add a group photo"}
          </FileButton>
          {group.avatarUrl && (
            <Button variant="ghost" className="min-h-11 px-4" disabled={busy} onClick={() => remove.mutate()}>
              {remove.isPending ? "Removing…" : "Use everyone's colours"}
            </Button>
          )}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

/** Pick your colour. Colours other members have show their initial and can't be picked. */
function ColourPicker({ group, members }: { group: Group; members: GroupMember[] | undefined }) {
  const me = useCurrentUser();
  const update = useUpdateMyMembership(group.id);
  const mine = update.isPending ? update.variables?.color : group.myColor;
  const takenBy = new Map<MemberColor, GroupMember>();
  for (const member of members ?? []) if (member.color && member.user.id !== me.id) takenBy.set(member.color, member);

  return (
    <SettingsSection
      title="Your colour"
      footnote="Your photos, reactions and part of Wrapped show in this colour. Colours with a letter belong to someone else here."
    >
      <div role="radiogroup" aria-label="Your colour" className="grid grid-cols-4 justify-items-center gap-x-1 gap-y-3 rounded-[1.25rem] bg-surface px-3 pt-4 pb-3">
        {MEMBER_COLORS.map((color) => {
          const swatch = MEMBER_PALETTE[color];
          const owner = takenBy.get(color);
          const selected = color === mine;
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={owner ? `${swatch.name}, taken by ${owner.user.displayName}` : swatch.name}
              disabled={Boolean(owner) || update.isPending}
              onClick={() =>
                update.mutate(
                  { color },
                  {
                    onError: (error) =>
                      toast(error instanceof ApiError && error.code === "COLOR_TAKEN" ? "Someone just took that colour. Pick another." : "Couldn't change your colour.", "error"),
                  },
                )
              }
              className="flex w-16 flex-col items-center gap-1.5 disabled:cursor-default"
            >
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-full text-[1.0625rem] font-semibold transition-[box-shadow,scale] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-90"
                style={{
                  background: swatch.hex,
                  color: swatch.ink,
                  boxShadow: selected ? "0 0 0 3px var(--surface), 0 0 0 6px var(--fg)" : owner ? "inset 0 0 0 3px rgb(0 0 0 / 0.18)" : undefined,
                }}
              >
                {owner ? (
                  Array.from(owner.user.displayName)[0]?.toUpperCase()
                ) : selected ? (
                  <span key={color} className="animate-pop-in">
                    ✓
                  </span>
                ) : (
                  ""
                )}
              </span>
              <span aria-hidden className={`text-xs ${selected ? "font-semibold" : "text-sub"}`}>
                {swatch.name}
              </span>
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}

function MemberRow({ group, member, onRemove }: { group: Group; member: GroupMember; onRemove?: () => void }) {
  const me = useCurrentUser();
  const block = useBlockPerson();
  const [dialog, setDialog] = useState<"report" | "block" | null>(null);
  const isYou = member.user.id === me.id;

  const items: MenuItem[] = [];
  if (!isYou) {
    items.push({ label: `Report ${member.user.displayName}`, icon: FlagIcon, onSelect: () => setDialog("report") });
    items.push({ label: `Block ${member.user.displayName}`, icon: BlockIcon, onSelect: () => setDialog("block") });
    if (onRemove) items.push({ label: `Remove from ${group.name}`, icon: TrashIcon, onSelect: onRemove });
  }

  return (
    <>
      <SettingsValue
        leading={<Avatar name={member.user.displayName} src={member.user.avatarUrl} color={member.color} size="md" />}
        label={member.user.displayName}
        description={`@${member.user.username}`}
        value={isYou ? "You" : member.role === "OWNER" ? "Owner" : undefined}
        trailing={
          items.length > 0 && (
            <Menu
              label={`Options for ${member.user.displayName}`}
              trigger={<MoreIcon className="size-5" />}
              triggerClassName="grid size-11 place-items-center rounded-full transition hover:bg-line"
              items={items}
            />
          )
        }
      />
      <ReportDialog open={dialog === "report"} onClose={() => setDialog(null)} userId={member.user.id} title={`Report ${member.user.displayName}`} />
      <ConfirmDialog
        open={dialog === "block"}
        title={`Block ${member.user.displayName}?`}
        description={`You won't see each other's photos, comments or reactions, even in ${group.name}. They aren't told.`}
        confirmLabel="Block"
        pendingLabel="Blocking…"
        variant="danger"
        isPending={block.isPending}
        error={getFormError(block.error)}
        onConfirm={() => block.mutate(member.user.id, { onSuccess: () => (toast(`${member.user.displayName} is blocked`), setDialog(null)) })}
        onClose={() => {
          setDialog(null);
          block.reset();
        }}
      />
    </>
  );
}

function Members({ group, members }: { group: Group; members: ReturnType<typeof useGroupMembers> }) {
  const removeMember = useRemoveMember(group.id);
  const [toRemove, setToRemove] = useState<GroupMember | null>(null);
  const isOwner = group.myRole === "OWNER";

  return (
    <SettingsSection title="Members">
      {members.isPending ? (
        <ListSkeleton rows={Math.min(group.memberCount, 6)} />
      ) : members.isLoadingError ? (
        <Alert>Couldn't load the members. Check your connection.</Alert>
      ) : (
        <SettingsGroup>
          {[...members.data]
            .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
            .map((member) => (
              <MemberRow key={member.user.id} group={group} member={member} onRemove={isOwner ? () => setToRemove(member) : undefined} />
            ))}
        </SettingsGroup>
      )}

      <ConfirmDialog
        open={toRemove !== null}
        title={`Remove ${toRemove?.user.displayName ?? "member"}?`}
        description="They'll lose access to this group straight away. They can only come back with a new invite link."
        confirmLabel="Remove"
        pendingLabel="Removing…"
        variant="danger"
        isPending={removeMember.isPending}
        error={getFormError(removeMember.error)}
        onClose={() => {
          setToRemove(null);
          removeMember.reset();
        }}
        onConfirm={() => {
          if (!toRemove) return;
          removeMember.mutate(toRemove.user.id, {
            onSuccess: () => {
              toast(`${toRemove.user.displayName} was removed from ${group.name}`);
              setToRemove(null);
            },
          });
        }}
      />
    </SettingsSection>
  );
}

function EditGroupDialog({ group, open, onClose }: { group: Group; open: boolean; onClose: () => void }) {
  const updateGroup = useUpdateGroup(group.id);
  return (
    <Dialog open={open} onClose={() => (updateGroup.reset(), onClose())} title="Name and emoji">
      <div className="mt-4">
        <GroupForm
          initialValues={{ name: group.name, emoji: group.emoji }}
          submitLabel="Save"
          pendingLabel="Saving…"
          isPending={updateGroup.isPending}
          error={updateGroup.error}
          onSubmit={(input) => updateGroup.mutate(input, { onSuccess: () => (toast("Group saved"), onClose()) })}
        />
      </div>
    </Dialog>
  );
}

export function GroupSettingsPage() {
  const group = useGroupContext();
  usePageTitle(`Settings · ${group.name}`);
  const navigate = useNavigate();
  const members = useGroupMembers(group.id);
  const mute = useUpdateMyMembership(group.id);
  const leaveGroup = useLeaveGroup(group.id);
  const resetInvites = useResetInvites(group.id);
  const [dialog, setDialog] = useState<"edit" | "reset" | "leave" | null>(null);
  const isOwner = group.myRole === "OWNER";
  const muted = mute.isPending ? Boolean(mute.variables?.muted) : group.muted;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader backTo={`/groups/${group.id}`} backLabel={`Back to ${group.name}`} />
      <GroupHeader group={group} />

      <ColourPicker group={group} members={members.data} />
      <Members group={group} members={members} />
      <InviteFriendsCard group={group} />

      <SettingsSection title="Group" footnote={isOwner ? undefined : "Only the owner can change the name, emoji and photo."}>
        <SettingsGroup>
          {isOwner ? (
            <SettingsButton label={`Name and emoji: ${group.emoji} ${group.name}`} onClick={() => setDialog("edit")} />
          ) : (
            <SettingsValue label="Name and emoji" value={`${group.emoji} ${group.name}`} />
          )}
          <SettingsSwitch
            label="Notifications"
            description={muted ? "Muted: nothing from this group" : "Everything, as set in Settings → Notifications"}
            checked={!muted}
            onChange={(on) => mute.mutate({ muted: !on }, { onError: () => toast("Couldn't change this group's notifications.", "error") })}
          />
          {isOwner && <SettingsButton label="Turn off all invite links" onClick={() => setDialog("reset")} />}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection footnote={leaveConsequence(group)}>
        <SettingsGroup>
          <SettingsButton strong label={`Leave ${group.name}`} onClick={() => setDialog("leave")} />
        </SettingsGroup>
      </SettingsSection>

      <EditGroupDialog group={group} open={dialog === "edit"} onClose={() => setDialog(null)} />

      <ConfirmDialog
        open={dialog === "reset"}
        title="Turn off all invite links?"
        description="Links that have already been shared will stop working. Members can make new ones."
        confirmLabel="Turn off links"
        pendingLabel="Turning off…"
        variant="danger"
        isPending={resetInvites.isPending}
        error={getFormError(resetInvites.error)}
        onClose={() => setDialog(null)}
        onConfirm={() => resetInvites.mutate(undefined, { onSuccess: () => (toast("Invite links turned off"), setDialog(null)) })}
      />

      <ConfirmDialog
        open={dialog === "leave"}
        title={`Leave ${group.name}?`}
        description={leaveConsequence(group)}
        confirmLabel={group.memberCount === 1 ? "Leave and delete" : "Leave group"}
        pendingLabel="Leaving…"
        variant="danger"
        isPending={leaveGroup.isPending}
        error={getFormError(leaveGroup.error)}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          leaveGroup.mutate(undefined, {
            onSuccess: () => {
              toast(group.memberCount === 1 ? `${group.name} was deleted` : `You left ${group.name}`);
              void navigate("/home", { replace: true });
            },
          })
        }
      />
    </div>
  );
}

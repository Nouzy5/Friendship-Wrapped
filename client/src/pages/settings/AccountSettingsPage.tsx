import { useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Avatar } from "../../components/ui/Avatar";
import { Button, buttonClasses } from "../../components/ui/Button";
import { FileButton } from "../../components/ui/FileButton";
import { ComputerIcon, PhoneIcon } from "../../components/ui/icons";
import { PageHeader } from "../../components/ui/PageHeader";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { SettingsButton, SettingsGroup, SettingsSection, SettingsValue } from "../../components/ui/SettingsList";
import { useCurrentUser } from "../../features/auth/hooks";
import { useCurrentGroup } from "../../features/groups/current-group";
import { DeleteAccountDialog } from "../../features/profile/components/DeleteAccountDialog";
import { useRemoveAvatar, useUploadAvatar } from "../../features/profile/hooks";
import { PHOTO_ARCHIVE_URL } from "../../features/settings/api";
import { DisplayNameDialog, PasswordDialog, UsernameDialog } from "../../features/settings/components/AccountDialogs";
import { useSessions, useSignOutDevice, useSignOutOtherDevices } from "../../features/settings/hooks";
import { getFormError } from "../../lib/form-errors";
import { formatRelativeTime } from "../../lib/format";
import { IMAGE_ACCEPT, imageFileError } from "../../lib/image-files";
import { usePageTitle } from "../../lib/usePageTitle";

function ProfilePhoto() {
  const user = useCurrentUser();
  const group = useCurrentGroup();
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const [fileError, setFileError] = useState<string | null>(null);
  const busy = upload.isPending || remove.isPending;
  const error = fileError ?? getFormError(upload.error) ?? getFormError(remove.error);

  function pickFile(file: File) {
    remove.reset();
    const problem = imageFileError(file);
    setFileError(problem);
    if (problem) upload.reset();
    else upload.mutate(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Avatar name={user.displayName} src={user.avatarUrl} color={group?.myColor} size="xl" />
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex flex-wrap gap-2">
            <FileButton accept={IMAGE_ACCEPT} onFile={pickFile} disabled={busy} className={buttonClasses("secondary", "min-h-11 px-4")}>
              {upload.isPending ? "Uploading…" : user.avatarUrl ? "Change photo" : "Add a profile photo"}
            </FileButton>
            {user.avatarUrl && (
              <Button
                variant="ghost"
                className="min-h-11 px-4"
                disabled={busy}
                onClick={() => {
                  setFileError(null);
                  upload.reset();
                  remove.mutate();
                }}
              >
                {remove.isPending ? "Removing…" : "Remove"}
              </Button>
            )}
          </div>
          <span className="text-[0.8125rem] leading-snug text-sub">
            {user.avatarUrl ? "Ringed in your colour in each group." : "Until then, friends see your initial in your colour."}
          </span>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

function SignedInDevices() {
  const sessions = useSessions();
  const signOut = useSignOutDevice();
  const signOutOthers = useSignOutOtherDevices();

  if (sessions.isPending) return <ListSkeleton rows={2} />;
  if (sessions.isLoadingError) return <Alert>Couldn't load your devices. Check your connection.</Alert>;

  const others = sessions.data.filter((session) => !session.current);

  return (
    <SettingsGroup>
      {sessions.data.map((session) => {
        const Icon = /iphone|android|phone/i.test(session.device) ? PhoneIcon : ComputerIcon;
        return (
          <SettingsValue
            key={session.id}
            icon={Icon}
            label={session.current ? `${session.device}, this device` : session.device}
            description={session.current ? "Active now" : `Last active ${formatRelativeTime(session.lastActiveAt)}`}
            trailing={
              !session.current && (
                <button
                  type="button"
                  aria-label={`Sign out ${session.device}`}
                  disabled={signOut.isPending}
                  onClick={() => signOut.mutate(session.id)}
                  className="h-11 shrink-0 rounded-full px-3 text-[0.9375rem] font-semibold transition hover:bg-line"
                >
                  Sign out
                </button>
              )
            }
          />
        );
      })}
      {others.length > 0 && (
        <SettingsButton
          strong
          label={signOutOthers.isPending ? "Signing out…" : "Sign out of all other devices"}
          onClick={() => signOutOthers.mutate()}
          disabled={signOutOthers.isPending}
        />
      )}
    </SettingsGroup>
  );
}

export function AccountSettingsPage() {
  usePageTitle("Account");
  const user = useCurrentUser();
  const [dialog, setDialog] = useState<"name" | "username" | "password" | "delete" | null>(null);
  const close = () => setDialog(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Account" backTo="/settings" backLabel="Back to settings" />

      <ProfilePhoto />

      <SettingsGroup>
        <SettingsButtonRow label="Display name" value={user.displayName} onClick={() => setDialog("name")} />
        <SettingsButtonRow label="Username" value={`@${user.username}`} onClick={() => setDialog("username")} />
        <SettingsButtonRow label="Password" value="Change" onClick={() => setDialog("password")} />
      </SettingsGroup>

      <SettingsSection title="Where you're signed in">
        <SignedInDevices />
      </SettingsSection>

      <SettingsSection title="Your data" footnote="A zip of every photo you've posted, in full size. It can take a while if you've posted a lot.">
        <SettingsGroup>
          <a href={PHOTO_ARCHIVE_URL} download className="flex min-h-14 items-center gap-3.5 py-2.5 pr-3 pl-4 text-base transition hover:bg-line/50">
            Download your photos
          </a>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection footnote="Deletes your photos, comments and reactions and takes you out of every group. You'll be asked for your password first.">
        <SettingsGroup>
          <SettingsButton strong label="Delete account" onClick={() => setDialog("delete")} />
        </SettingsGroup>
      </SettingsSection>

      <DisplayNameDialog open={dialog === "name"} onClose={close} user={user} />
      <UsernameDialog open={dialog === "username"} onClose={close} user={user} />
      <PasswordDialog open={dialog === "password"} onClose={close} />
      <DeleteAccountDialog open={dialog === "delete"} onClose={close} />
    </div>
  );
}

/** A row that opens a small editor, showing the current value. */
function SettingsButtonRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 py-2.5 pr-3 pl-4 text-left transition hover:bg-line/50">
      <span className="flex-1 text-base">{label}</span>
      <span className="max-w-[55%] truncate text-base text-sub">{value}</span>
      <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-sub" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

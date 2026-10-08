import { useState } from "react";
import { Link } from "react-router";
import { Alert } from "../../components/ui/Alert";
import { Avatar } from "../../components/ui/Avatar";
import {
  AppearanceIcon,
  BellIcon,
  CameraIcon,
  DocumentIcon,
  HelpIcon,
  InfoIcon,
  PersonIcon,
  PlusIcon,
  ShieldIcon,
  SignOutIcon,
} from "../../components/ui/icons";
import { PageHeader } from "../../components/ui/PageHeader";
import { SettingsButton, SettingsGroup, SettingsLink, SettingsSection, SettingsValue } from "../../components/ui/SettingsList";
import { useCurrentUser, useLogout } from "../../features/auth/hooks";
import { useCurrentGroup } from "../../features/groups/current-group";
import { GroupAvatar } from "../../features/groups/components/GroupAvatar";
import { useMyGroups } from "../../features/groups/hooks";
import { ReportDialog } from "../../features/settings/components/ReportDialog";
import { useSettings } from "../../features/settings/hooks";
import { SystemStatusCard } from "../../features/system/SystemStatusCard";
import { useDeviceSettings } from "../../lib/device-settings";
import { getFormError } from "../../lib/form-errors";
import { formatMemberCount } from "../../lib/format";
import { usePageTitle } from "../../lib/usePageTitle";

const THEME_LABELS = { system: "Match device", light: "Light", dark: "Dark" } as const;

export function SettingsHomePage() {
  usePageTitle("Settings");
  const user = useCurrentUser();
  const logout = useLogout();
  const groups = useMyGroups();
  const current = useCurrentGroup();
  const settings = useSettings();
  const device = useDeviceSettings();
  const [reporting, setReporting] = useState(false);
  const notificationsOn = settings.data?.notifications.enabled;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" backTo="/home" backLabel="Back to home" />

      <div className="-mt-2 flex items-center gap-3.5 rounded-3xl bg-surface p-4">
        <Avatar name={user.displayName} src={user.avatarUrl} color={current?.myColor} size="lg" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xl font-semibold">{user.displayName}</span>
          <span className="truncate text-sm text-sub">@{user.username}</span>
        </div>
        <Link
          to="/settings/account"
          className="ml-auto flex h-11 shrink-0 items-center rounded-full bg-bg px-4 text-[0.9375rem] font-semibold transition hover:opacity-80"
        >
          Edit profile
        </Link>
      </div>

      <SettingsGroup>
        <SettingsLink to="/settings/account" icon={PersonIcon} label="Account" />
        <SettingsLink
          to="/settings/notifications"
          icon={BellIcon}
          label="Notifications"
          value={notificationsOn === undefined ? undefined : notificationsOn ? "On" : "Off"}
        />
        <SettingsLink to="/settings/appearance" icon={AppearanceIcon} label="Appearance" value={THEME_LABELS[device.theme]} />
        <SettingsLink to="/settings/privacy" icon={ShieldIcon} label="Privacy & safety" />
        <SettingsLink to="/settings/photos" icon={CameraIcon} label="Photos & data" />
      </SettingsGroup>

      <SettingsSection title="Your groups">
        <SettingsGroup>
          {groups.data?.map((group) => (
            <SettingsLink
              key={group.id}
              to={`/groups/${group.id}/settings`}
              leading={<GroupAvatar group={group} size={36} />}
              label={group.name}
              description={`${formatMemberCount(group.memberCount)}${group.muted ? ", muted" : ""}`}
            />
          ))}
          <SettingsLink
            to="/groups/new"
            leading={
              <span aria-hidden className="grid size-9 place-items-center rounded-[0.6875rem] bg-bg">
                <PlusIcon className="size-5" />
              </span>
            }
            label="New group"
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Help & about">
        <SettingsGroup>
          <SettingsButton icon={HelpIcon} label="Report a problem" onClick={() => setReporting(true)} />
          <SettingsLink to="/settings/terms" icon={DocumentIcon} label="Terms and privacy policy" />
          <SettingsValue icon={InfoIcon} label="Version" value={__APP_VERSION__} />
        </SettingsGroup>
      </SettingsSection>

      <SystemStatusCard />

      {logout.isError && <Alert>{getFormError(logout.error)}</Alert>}
      <SettingsGroup>
        <SettingsButton strong icon={SignOutIcon} label={logout.isPending ? "Signing out…" : "Sign out"} onClick={() => logout.mutate()} disabled={logout.isPending} />
      </SettingsGroup>

      <ReportDialog open={reporting} onClose={() => setReporting(false)} />
    </div>
  );
}

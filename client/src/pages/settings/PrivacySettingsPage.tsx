import { useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { SettingsButton, SettingsGroup, SettingsLink, SettingsSection, SettingsSwitch, SettingsValue } from "../../components/ui/SettingsList";
import { ReportDialog } from "../../features/settings/components/ReportDialog";
import { useBlocked, useMyInvites, useSettings, useUpdateSettings } from "../../features/settings/hooks";
import { usePageTitle } from "../../lib/usePageTitle";

export function PrivacySettingsPage() {
  usePageTitle("Privacy & safety");
  const settings = useSettings();
  const update = useUpdateSettings();
  const blocked = useBlocked();
  const invites = useMyInvites();
  const [reporting, setReporting] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Privacy & safety"
        subtitle="Only the people in a group can see what's posted to it. Nothing you post is public."
        backTo="/settings"
        backLabel="Back to settings"
      />

      {settings.isPending ? (
        <ListSkeleton rows={3} />
      ) : settings.isLoadingError ? (
        <div className="flex flex-col items-start gap-3">
          <Alert>Couldn't load your privacy settings. Check your connection.</Alert>
          <Button variant="secondary" onClick={() => void settings.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <SettingsSection title="Your photos">
            <SettingsGroup>
              <SettingsValue label="Location removed" description="Where a photo was taken is always stripped before it's stored." />
              <SettingsSwitch
                label="Friends can save your photos"
                description="Shows a Save option on the photos you post"
                checked={settings.data.allowPhotoSaving}
                onChange={(allowPhotoSaving) => update.mutate({ allowPhotoSaving })}
              />
            </SettingsGroup>
          </SettingsSection>

          <SettingsSection title="Wrapped">
            <SettingsGroup>
              <SettingsSwitch
                label="Show my name in Wrapped"
                description="Off keeps your photos in the group's totals but leaves your name and colour off the slides"
                checked={settings.data.showInWrapped}
                onChange={(showInWrapped) => update.mutate({ showInWrapped })}
              />
            </SettingsGroup>
          </SettingsSection>
        </>
      )}

      <SettingsSection title="Safety" footnote="Someone you block can't see your photos, comments or reactions, even in groups you share. You won't see theirs either.">
        <SettingsGroup>
          <SettingsLink to="/settings/blocked" label="Blocked people" value={blocked.data ? (blocked.data.length === 0 ? "None" : String(blocked.data.length)) : undefined} />
          <SettingsLink to="/settings/invites" label="Invite links you've made" value={invites.data ? (invites.data.length === 0 ? "None" : `${invites.data.length} active`) : undefined} />
          <SettingsButton label="Report a problem" onClick={() => setReporting(true)} />
        </SettingsGroup>
      </SettingsSection>

      <ReportDialog open={reporting} onClose={() => setReporting(false)} />
    </div>
  );
}

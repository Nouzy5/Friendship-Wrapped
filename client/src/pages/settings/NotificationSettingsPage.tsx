import { useId, useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { SettingsGroup, SettingsSection, SettingsSwitch } from "../../components/ui/SettingsList";
import { GroupAvatar } from "../../features/groups/components/GroupAvatar";
import { useMyGroups, useUpdateMyMembership } from "../../features/groups/hooks";
import type { Group } from "../../features/groups/types";
import { turnOnPush, usePushState, type PushState } from "../../features/notifications/push";
import { useSettings, useUpdateSettings } from "../../features/settings/hooks";
import type { NotificationSettings } from "../../features/settings/types";
import { toast } from "../../lib/toast";
import { usePageTitle } from "../../lib/usePageTitle";

const PUSH_MESSAGES: Record<Exclude<PushState, "on">, string> = {
  off: "This device isn't getting notifications yet.",
  denied: "Notifications are blocked for this site. Allow them in your browser or phone settings, then come back.",
  unsupported: "This browser can't show notifications. On iPhone, add the app to your Home Screen first.",
  unavailable: "Notifications aren't set up on the server yet.",
};

/** Whether this particular device receives pushes (the switches below are for your whole account). */
function ThisDevice() {
  const [state, refresh] = usePushState();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  if (!state || state === "on") return null;

  return (
    <div className="flex flex-col gap-3 rounded-[1.25rem] bg-surface p-4">
      <p className="text-[0.9375rem]">{PUSH_MESSAGES[state]}</p>
      {state === "off" && (
        <Button
          variant="accent"
          className="self-start"
          disabled={working}
          onClick={async () => {
            setWorking(true);
            setError(null);
            try {
              await turnOnPush();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Couldn't turn on notifications.");
            } finally {
              setWorking(false);
              refresh();
            }
          }}
        >
          {working ? "Turning on…" : "Turn on for this device"}
        </Button>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

function QuietHoursTimes({ settings, disabled }: { settings: NotificationSettings["quietHours"]; disabled: boolean }) {
  const update = useUpdateSettings();
  const startId = useId();
  const endId = useId();
  const field = "h-11 rounded-xl bg-bg px-3 text-base tabular-nums disabled:opacity-40";

  return (
    <div className="flex min-h-14 items-center gap-3 py-2 pr-3 pl-4">
      <span className="flex-1 text-base">Between</span>
      <label htmlFor={startId} className="sr-only">
        Quiet hours start
      </label>
      <input
        id={startId}
        type="time"
        value={settings.start}
        disabled={disabled}
        onChange={(event) => event.target.value && update.mutate({ notifications: { quietHours: { start: event.target.value } } })}
        className={field}
      />
      <span aria-hidden className="text-sub">
        and
      </span>
      <label htmlFor={endId} className="sr-only">
        Quiet hours end
      </label>
      <input
        id={endId}
        type="time"
        value={settings.end}
        disabled={disabled}
        onChange={(event) => event.target.value && update.mutate({ notifications: { quietHours: { end: event.target.value } } })}
        className={field}
      />
    </div>
  );
}

function GroupMuteRow({ group, disabled }: { group: Group; disabled: boolean }) {
  const update = useUpdateMyMembership(group.id);
  const muted = update.isPending ? Boolean(update.variables?.muted) : group.muted;

  return (
    <div className="flex items-center gap-3 pl-3.5">
      <GroupAvatar group={group} size={32} />
      <div className="min-w-0 flex-1">
        <SettingsSwitch
          label={group.name}
          description={muted ? "Muted" : "Everything"}
          checked={!muted}
          disabled={disabled}
          onChange={(on) => update.mutate({ muted: !on }, { onError: () => toast("Couldn't change that group's notifications.", "error") })}
        />
      </div>
    </div>
  );
}

export function NotificationSettingsPage() {
  usePageTitle("Notifications");
  const settings = useSettings();
  const update = useUpdateSettings();
  const groups = useMyGroups();

  if (settings.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Notifications" backTo="/settings" backLabel="Back to settings" />
        <ListSkeleton rows={6} />
      </div>
    );
  }

  if (settings.isLoadingError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Notifications" backTo="/settings" backLabel="Back to settings" />
        <Alert>Couldn't load your notification settings. Check your connection and try again.</Alert>
        <Button variant="secondary" className="self-start" onClick={() => void settings.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const notifications = settings.data.notifications;
  const off = !notifications.enabled;
  const set = (changes: Partial<Omit<NotificationSettings, "quietHours">>) => update.mutate({ notifications: changes });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Notifications" backTo="/settings" backLabel="Back to settings" />

      <ThisDevice />

      <SettingsGroup>
        <SettingsSwitch
          label={<span className="font-semibold">Allow notifications</span>}
          description="Turn this off to pause everything at once."
          checked={notifications.enabled}
          onChange={(enabled) => set({ enabled })}
        />
      </SettingsGroup>

      <div className={`flex flex-col gap-6 transition-opacity ${off ? "opacity-40" : ""}`}>
        <SettingsSection title="From your groups">
          <SettingsGroup>
            <SettingsSwitch label="New photos" description="When a friend posts" checked={notifications.photos} disabled={off} onChange={(photos) => set({ photos })} />
            <SettingsSwitch label="Reactions" description="When someone reacts to your photo" checked={notifications.reactions} disabled={off} onChange={(reactions) => set({ reactions })} />
            <SettingsSwitch label="Comments" description="On your photos, and on ones you've commented on" checked={notifications.comments} disabled={off} onChange={(comments) => set({ comments })} />
            <SettingsSwitch label="New members" description="When someone joins one of your groups" checked={notifications.members} disabled={off} onChange={(members) => set({ members })} />
            <SettingsSwitch label="Moments" description="When someone starts a moment in one of your groups" checked={notifications.moments} disabled={off} onChange={(moments) => set({ moments })} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title="Memories">
          <SettingsGroup>
            <SettingsSwitch label="On this day" description="In the morning, when there are photos from this date" checked={notifications.onThisDay} disabled={off} onChange={(onThisDay) => set({ onThisDay })} />
            <SettingsSwitch label="Wrapped is ready" description="Once a year, when your group's Wrapped is out" checked={notifications.wrapped} disabled={off} onChange={(wrapped) => set({ wrapped })} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title="Reminders" footnote="Never more than one every two weeks, and never about anyone else: it only says it has been a while since you posted.">
          <SettingsGroup>
            <SettingsSwitch label="Gentle reminders" description="In the early evening, when you haven't posted for a while" checked={notifications.nudges} disabled={off} onChange={(nudges) => set({ nudges })} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title="Quiet hours" footnote="Anything that comes in during quiet hours waits until they end.">
          <SettingsGroup>
            <SettingsSwitch
              label="Quiet hours"
              description="Notifications wait until the morning"
              checked={notifications.quietHours.enabled}
              disabled={off}
              onChange={(enabled) => update.mutate({ notifications: { quietHours: { enabled } } })}
            />
            {notifications.quietHours.enabled && <QuietHoursTimes settings={notifications.quietHours} disabled={off} />}
          </SettingsGroup>
        </SettingsSection>

        {groups.data && groups.data.length > 0 && (
          <SettingsSection title="Each group" footnote="A muted group still shows new photos in the app. It just doesn't notify you.">
            <SettingsGroup>
              {groups.data.map((group) => (
                <GroupMuteRow key={group.id} group={group} disabled={off} />
              ))}
            </SettingsGroup>
          </SettingsSection>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { SettingsButton, SettingsChoice, SettingsGroup, SettingsSection, SettingsSwitch, SettingsValue } from "../../components/ui/SettingsList";
import { clearSavedPhotos, savedPhotosSize } from "../../features/notifications/push";
import { updateDeviceSettings, useDeviceSettings } from "../../lib/device-settings";
import { toast } from "../../lib/toast";
import { usePageTitle } from "../../lib/usePageTitle";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Photos kept on this device so the app opens fast, and a way to clear them. */
function Storage() {
  const [size, setSize] = useState<number | null | undefined>(undefined);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void savedPhotosSize()
      .catch(() => null)
      .then((bytes) => !cancelled && setSize(bytes));
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <SettingsSection title="Storage" footnote="Only removes copies kept to make the app faster. Your posts and your groups' photos aren't touched.">
      <SettingsGroup>
        <SettingsValue label="Saved on this device" value={size === undefined ? "…" : size === null ? "Unknown" : formatBytes(size)} />
        <SettingsButton
          label="Clear saved photos"
          disabled={!size}
          onClick={async () => {
            await clearSavedPhotos();
            toast("Saved photos cleared");
            setVersion((value) => value + 1);
          }}
        />
      </SettingsGroup>
    </SettingsSection>
  );
}

export function PhotoSettingsPage() {
  usePageTitle("Photos & data");
  const settings = useDeviceSettings();
  const canTellMobileData = "connection" in navigator;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Photos & data" subtitle="These apply to this device." backTo="/settings" backLabel="Back to settings" />

      <SettingsSection title="Camera opens with">
        <SettingsChoice
          label="Camera opens with"
          value={settings.cameraFacing}
          onChange={(cameraFacing) => updateDeviceSettings({ cameraFacing })}
          options={[
            { value: "environment", label: "Back camera" },
            { value: "user", label: "Front camera" },
          ]}
        />
      </SettingsSection>

      <SettingsSection title="Camera">
        <SettingsGroup>
          <SettingsSwitch
            label="Mirror front camera"
            description="Selfies come out the way you saw them on screen"
            checked={settings.mirrorFrontCamera}
            onChange={(mirrorFrontCamera) => updateDeviceSettings({ mirrorFrontCamera })}
          />
          <SettingsSwitch label="Grid lines" checked={settings.cameraGrid} onChange={(cameraGrid) => updateDeviceSettings({ cameraGrid })} />
          <SettingsSwitch
            label="Save to this device"
            description="Downloads a copy of every photo you post"
            checked={settings.saveToDevice}
            onChange={(saveToDevice) => updateDeviceSettings({ saveToDevice })}
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Photo quality">
        <SettingsChoice
          label="Photo quality"
          value={settings.photoQuality}
          onChange={(photoQuality) => updateDeviceSettings({ photoQuality })}
          options={[
            { value: "standard", label: "Standard", description: "Quick to send, looks great on a phone" },
            { value: "high", label: "High", description: "Sharper, takes longer to send" },
          ]}
        />
      </SettingsSection>

      <SettingsSection
        title="Data"
        footnote={canTellMobileData ? undefined : "This browser doesn't say whether you're on mobile data, so photos always upload straight away here."}
      >
        <SettingsGroup>
          <SettingsSwitch
            label="Upload on mobile data"
            description="When off, photos wait for Wi-Fi before they're posted"
            checked={settings.uploadOnMobileData}
            onChange={(uploadOnMobileData) => updateDeviceSettings({ uploadOnMobileData })}
          />
          <SettingsSwitch
            label="Data saver"
            description="Loads smaller photos, even full screen"
            checked={settings.dataSaver}
            onChange={(dataSaver) => updateDeviceSettings({ dataSaver })}
          />
        </SettingsGroup>
      </SettingsSection>

      <Storage />
    </div>
  );
}

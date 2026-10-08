import type { ReactNode } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { SettingsChoice, SettingsGroup, SettingsSection, SettingsSwitch } from "../../components/ui/SettingsList";
import { useCurrentGroup } from "../../features/groups/current-group";
import { updateDeviceSettings, useDeviceSettings, type DeviceSettings } from "../../lib/device-settings";
import { MEMBER_PALETTE } from "../../lib/member-colors";
import { useDeviceIsDark } from "../../lib/theme";
import { usePageTitle } from "../../lib/usePageTitle";

const STRIPES = [MEMBER_PALETTE.LIME, MEMBER_PALETTE.COBALT, MEMBER_PALETTE.TOMATO, MEMBER_PALETTE.SUN, MEMBER_PALETTE.BUBBLEGUM];

/** A tiny feed: badge, name, a photo and two reaction pills, in light or dark. */
function MiniFeed({ dark }: { dark: boolean }) {
  const ink = dark ? "#ffffff" : "#000000";
  const pill = dark ? "#2c2c2a" : "#f2f2f0";
  return (
    <span className="absolute inset-0" style={{ background: dark ? "#000000" : "#ffffff" }}>
      <span className="absolute top-3 left-2.5 flex size-4.5 overflow-hidden rounded-md">
        {STRIPES.map((swatch) => (
          <span key={swatch.hex} className="flex-1" style={{ background: swatch.hex }} />
        ))}
      </span>
      <span className="absolute top-4 left-8.5 h-2.5 w-11 rounded-full" style={{ background: ink }} />
      <span
        className="absolute inset-x-2 top-10 h-[4.375rem] rounded-[0.875rem]"
        style={{ background: "radial-gradient(circle at 30% 35%, rgba(255,176,70,.95) 0 6%, rgba(255,176,70,0) 18%), radial-gradient(ellipse at 50% 115%, #40203f 0%, #150b1f 55%, #07060c 100%)" }}
      />
      <span className="absolute top-30 left-2.5 h-3.5 w-8.5 rounded-full" style={{ background: pill }} />
      <span className="absolute top-30 left-12 h-3.5 w-8.5 rounded-full" style={{ background: pill }} />
    </span>
  );
}

function ThemeOption({ selected, label, onSelect, children }: { selected: boolean; label: string; onSelect: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className="flex flex-col items-center gap-2.5">
      <span
        aria-hidden
        className={`relative block h-[9.375rem] self-stretch overflow-hidden rounded-[1.25rem] transition ${
          selected ? "shadow-[0_0_0_3px_var(--bg),0_0_0_6px_var(--accent)]" : "shadow-[0_0_0_1px_var(--line)]"
        }`}
      >
        {children}
      </span>
      <span className={`text-[0.9375rem] ${selected ? "font-semibold" : ""}`}>{label}</span>
    </button>
  );
}

function AppIconOption({ selected, label, onSelect, children }: { selected: boolean; label: string; onSelect: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className="flex flex-col items-center gap-2">
      <span
        aria-hidden
        className={`flex size-16 overflow-hidden rounded-[1.125rem] transition ${
          selected ? "shadow-[0_0_0_3px_var(--bg),0_0_0_6px_var(--accent)]" : "shadow-[0_0_0_1px_var(--line)]"
        }`}
      >
        {children}
      </span>
      <span className={`text-sm ${selected ? "font-semibold" : ""}`}>{label}</span>
    </button>
  );
}

export function AppearanceSettingsPage() {
  usePageTitle("Appearance");
  const settings = useDeviceSettings();
  const deviceIsDark = useDeviceIsDark();
  const group = useCurrentGroup();
  const yours = MEMBER_PALETTE[group?.myColor ?? "COBALT"];
  const set = (changes: Partial<DeviceSettings>) => updateDeviceSettings(changes);

  const themeNote = {
    system: `Follows your device. It's ${deviceIsDark ? "dark" : "light"} right now, so the app is too.`,
    light: "Always light, whatever your device is set to.",
    dark: "Always dark, whatever your device is set to.",
  }[settings.theme];

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="Appearance" backTo="/settings" backLabel="Back to settings" />

      <SettingsSection title="Theme" footnote={<span aria-live="polite">{themeNote}</span>}>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3 px-1 pt-1">
          <ThemeOption selected={settings.theme === "system"} label="Match device" onSelect={() => set({ theme: "system" })}>
            <MiniFeed dark={false} />
            <span className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
              <MiniFeed dark />
            </span>
          </ThemeOption>
          <ThemeOption selected={settings.theme === "light"} label="Light" onSelect={() => set({ theme: "light" })}>
            <MiniFeed dark={false} />
          </ThemeOption>
          <ThemeOption selected={settings.theme === "dark"} label="Dark" onSelect={() => set({ theme: "dark" })}>
            <MiniFeed dark />
          </ThemeOption>
        </div>
      </SettingsSection>

      <SettingsSection
        title="App icon"
        footnote="Changes the icon in your browser tab. On the iPhone app it changes the Home Screen icon."
      >
        <div role="radiogroup" aria-label="App icon" className="flex gap-5 px-1 pt-1">
          <AppIconOption selected={settings.appIcon === "classic"} label="Classic" onSelect={() => set({ appIcon: "classic" })}>
            {STRIPES.map((swatch) => (
              <span key={swatch.hex} className="flex-1" style={{ background: swatch.hex }} />
            ))}
          </AppIconOption>
          <AppIconOption selected={settings.appIcon === "night"} label="Night" onSelect={() => set({ appIcon: "night" })}>
            <span className="flex flex-1 items-end gap-[3px] bg-black px-3 py-3.5">
              {[16, 30, 22, 36, 26].map((height, index) => (
                <span key={height} className="flex-1 rounded-[4px]" style={{ height, background: STRIPES[index]!.hex }} />
              ))}
            </span>
          </AppIconOption>
          <AppIconOption selected={settings.appIcon === "yours"} label="Your colour" onSelect={() => set({ appIcon: "yours" })}>
            <span className="grid flex-1 place-items-center" style={{ background: yours.hex }}>
              <span className="flex size-7.5 rounded-full border-4 p-[3px]" style={{ borderColor: yours.ink }}>
                <span className="flex-1 rounded-full" style={{ background: yours.ink }} />
              </span>
            </span>
          </AppIconOption>
        </div>
      </SettingsSection>

      <SettingsSection title="Reduce motion" footnote="Calmer Wrapped transitions and no zooms or floating emoji.">
        <SettingsChoice
          label="Reduce motion"
          value={settings.reduceMotion}
          onChange={(reduceMotion) => set({ reduceMotion })}
          options={[
            { value: "system", label: "Match device" },
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
      </SettingsSection>

      <SettingsSection footnote="Text size follows your device's settings.">
        <SettingsGroup>
          <SettingsSwitch
            label="Haptics"
            description="A small tap when you react or take a photo, where your device supports it"
            checked={settings.haptics}
            onChange={(haptics) => set({ haptics })}
          />
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}

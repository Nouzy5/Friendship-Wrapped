import { useEffect, useRef } from "react";
import { useDeviceSettings } from "../../lib/device-settings";
import { MEMBER_PALETTE, type MemberColor } from "../../lib/member-colors";
import { browserTimeZone } from "../../lib/time-zone";
import { useAccentFromCurrentGroup, useCurrentGroup } from "../groups/current-group";
import { useSettings, useUpdateSettings } from "./hooks";
import { useKeepPushSubscription } from "../notifications/push";

const STRIPES = ["LIME", "COBALT", "TOMATO", "SUN", "BUBBLEGUM"] as const;

/** The browser tab's icon, drawn to match Settings → Appearance → App icon. */
function appIconSvg(icon: "classic" | "night" | "yours", color: MemberColor | null | undefined): string {
  const stripes = STRIPES.map((name, index) => `<rect x="${index * 12.8}" width="12.8" height="64" fill="${MEMBER_PALETTE[name].hex}"/>`).join("");
  const bars = [16, 30, 22, 36, 26]
    .map((height, index) => `<rect x="${12 + index * 8.4}" y="${50 - height}" width="6" height="${height}" rx="2" fill="${MEMBER_PALETTE[STRIPES[index]!].hex}"/>`)
    .join("");
  const yours = MEMBER_PALETTE[color ?? "COBALT"];
  const body = {
    classic: stripes,
    night: `<rect width="64" height="64" fill="#000"/>${bars}`,
    yours: `<rect width="64" height="64" fill="${yours.hex}"/><circle cx="32" cy="32" r="13" fill="none" stroke="${yours.ink}" stroke-width="4"/><circle cx="32" cy="32" r="7.5" fill="${yours.ink}"/>`,
  }[icon];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><clipPath id="c"><rect width="64" height="64" rx="18"/></clipPath><g clip-path="url(#c)">${body}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Things that run in the background while you're signed in: your colour as the accent, the app
 * icon, telling the server your time zone (quiet hours, morning notifications) and keeping this
 * device's push subscription registered.
 */
export function SignedInEffects() {
  useAccentFromCurrentGroup();
  useKeepPushSubscription();

  const { appIcon } = useDeviceSettings();
  const group = useCurrentGroup();
  const myColor = group?.myColor;
  useEffect(() => {
    document.querySelector('link[rel="icon"]')?.setAttribute("href", appIconSvg(appIcon, myColor));
  }, [appIcon, myColor]);

  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const sentZone = useRef(false);
  const zone = browserTimeZone();
  useEffect(() => {
    if (!settings.data || sentZone.current || settings.data.timeZone === zone) return;
    sentZone.current = true;
    updateSettings.mutate({ timeZone: zone });
  }, [settings.data, zone, updateSettings]);

  return null;
}

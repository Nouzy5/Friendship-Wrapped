/**
 * The browser's IANA time zone (e.g. "Europe/Bratislava"): days and years are counted in it.
 * A device that can't tell its zone reports "Etc/Unknown" (or nothing), which no server
 * accepts, so that counts as UTC rather than breaking Memories and Wrapped.
 */
export function browserTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && zone !== "Etc/Unknown" ? zone : "UTC";
}

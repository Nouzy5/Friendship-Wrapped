/** The browser's IANA time zone (e.g. "Europe/Bratislava"): days and years are counted in it. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

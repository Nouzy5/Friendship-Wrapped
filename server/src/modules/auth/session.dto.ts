/** A signed-in device, as the person sees it in their account. */
export type SessionView = {
  /** Opaque: a prefix of the stored token hash, never the token, nor even the whole hash. */
  id: string;
  /** A readable label from the user agent, e.g. "Chrome on Windows". */
  device: string;
  createdAt: Date;
  lastActiveAt: Date;
  /** The session this request came with. */
  current: boolean;
};

/** 16 hex digits: unique enough among one person's sessions (they're matched with the user id too). */
export const publicSessionId = (sessionId: string) => sessionId.slice(0, 16);

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\b(OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\b(Firefox|FxiOS)\//, "Firefox"],
  [/\b(Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "Mac"],
  [/\bLinux\b/, "Linux"],
];

const match = (userAgent: string, patterns: [RegExp, string][]) =>
  patterns.find(([pattern]) => pattern.test(userAgent))?.[1];

/** "Chrome on Windows", "Safari on iPhone", "Friendship Wrapped app on iPhone", or "Unknown device". */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  // The iOS app is a plain URLSession client: "FriendshipWrapped/1 CFNetwork/… Darwin/…".
  if (/^FriendshipWrapped\//.test(userAgent) || (/\bCFNetwork\//.test(userAgent) && /\bDarwin\//.test(userAgent))) {
    return "Friendship Wrapped app on iPhone";
  }
  const browser = match(userAgent, BROWSERS);
  const system = match(userAgent, SYSTEMS);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? "Unknown device";
}

export function toSessionView(
  session: { id: string; userAgent: string | null; createdAt: Date; lastActiveAt: Date },
  currentId: string,
): SessionView {
  return {
    id: publicSessionId(session.id),
    device: deviceLabel(session.userAgent),
    createdAt: session.createdAt,
    lastActiveAt: session.lastActiveAt,
    current: session.id === currentId,
  };
}

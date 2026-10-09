import { createHash, createPrivateKey, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import http2 from "node:http2";
import { env } from "../config/env.js";
import type { PushPayload } from "./push.js";

/** Which Apple push server a device token belongs to (see the ApnsEnvironment enum in the schema). */
export type ApnsEnvironment = "SANDBOX" | "PRODUCTION";

/** One iPhone, as the app registered it. */
export type ApnsTarget = { token: string; environment: ApnsEnvironment };

/**
 * Delivers one notification to one iPhone. Rejects with an `ApnsError` when Apple refuses it
 * (see `isDeviceGone`).
 */
export type ApnsSender = (target: ApnsTarget, payload: PushPayload) => Promise<void>;

/** Apple's refusal: the HTTP status and the `reason` in its answer (e.g. "BadDeviceToken"). */
export class ApnsError extends Error {
  readonly statusCode: number;
  readonly reason: string | null;

  constructor(statusCode: number, reason: string | null) {
    super(`APNs refused the notification: ${statusCode}${reason ? ` ${reason}` : ""}`);
    this.name = "ApnsError";
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

/** Apple did not answer in time. Not retried: Apple is slow, not a stale connection. */
export class ApnsTimeoutError extends Error {
  constructor() {
    super("APNs did not answer in time");
    this.name = "ApnsTimeoutError";
  }
}

export const APNS_ORIGINS: Record<ApnsEnvironment, string> = {
  PRODUCTION: "https://api.push.apple.com",
  SANDBOX: "https://api.sandbox.push.apple.com",
};

/** Apple wants a provider token renewed no more than every 20 minutes and at least every 60. */
const PROVIDER_TOKEN_LIFETIME_MS = 40 * 60 * 1000;
/** A day, like web push: a notification nobody could receive by then isn't worth showing. */
const TTL_SECONDS = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 10_000;
/** `apns-collapse-id` may be at most 64 bytes. */
const MAX_COLLAPSE_ID_BYTES = 64;

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** A signed JWT proving the server is the app's provider: ES256 with the key from Apple. */
export function signProviderToken(key: KeyObject, keyId: string, teamId: string, issuedAtMs: number): string {
  const unsigned = `${base64url({ alg: "ES256", kid: keyId })}.${base64url({ iss: teamId, iat: Math.floor(issuedAtMs / 1000) })}`;
  // JWT wants the raw r||s signature, not DER.
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${signature.toString("base64url")}`;
}

/** What Apple's notification service receives for a payload: the alert, and where a tap goes. */
export function apnsBody({ title, body, url }: PushPayload): string {
  return JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, url });
}

/** Notifications with the same collapse ID replace each other on the phone, like a web tag. */
export function collapseId(tag: string): string {
  return Buffer.byteLength(tag) <= MAX_COLLAPSE_ID_BYTES ? tag : createHash("sha256").update(tag).digest("hex");
}

export type ApnsConfig = {
  key: KeyObject;
  keyId: string;
  teamId: string;
  /** The app's bundle identifier. */
  topic: string;
  /** Where to connect: Apple's servers unless a test runs its own. */
  origins?: Record<ApnsEnvironment, string>;
  timeoutMs?: number;
  now?: () => number;
};

export type ApnsConnection = { send: ApnsSender; close: () => void };

/** Talks HTTP/2 to Apple, keeping one connection per server and reconnecting when it drops. */
export function createApnsSender(config: ApnsConfig): ApnsConnection {
  const origins = config.origins ?? APNS_ORIGINS;
  const timeoutMs = config.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const now = config.now ?? Date.now;
  const sessions = new Map<string, http2.ClientHttp2Session>();
  let providerToken: { value: string; issuedAt: number } | null = null;

  function token(): string {
    const current = now();
    if (!providerToken || current - providerToken.issuedAt >= PROVIDER_TOKEN_LIFETIME_MS) {
      providerToken = { value: signProviderToken(config.key, config.keyId, config.teamId, current), issuedAt: current };
    }
    return providerToken.value;
  }

  function dropSession(origin: string): void {
    sessions.get(origin)?.destroy();
    sessions.delete(origin);
  }

  function sessionFor(origin: string): http2.ClientHttp2Session {
    const existing = sessions.get(origin);
    if (existing && !existing.closed && !existing.destroyed) return existing;

    const session = http2.connect(origin);
    const forget = () => {
      if (sessions.get(origin) === session) sessions.delete(origin);
    };
    session.on("error", forget);
    session.on("close", forget);
    // Apple is closing it (or has): use a new connection for the next one.
    session.on("goaway", forget);
    // An idle connection mustn't keep the process alive.
    session.unref();
    sessions.set(origin, session);
    return session;
  }

  function post(origin: string, path: string, headers: http2.OutgoingHttpHeaders, body: string) {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      let settled = false;
      const settle = (finish: () => void) => {
        if (settled) return;
        settled = true;
        finish();
      };

      let request: http2.ClientHttp2Stream;
      try {
        request = sessionFor(origin).request({ ":method": "POST", ":path": path, ...headers });
      } catch (error) {
        reject(error);
        return;
      }

      let status = 0;
      let answer = "";
      request.setEncoding("utf8");
      request.on("response", (responseHeaders) => {
        status = Number(responseHeaders[":status"]);
      });
      request.on("data", (chunk: string) => {
        answer += chunk;
      });
      request.on("end", () => {
        // A connection that dies mid-request can end the stream without any answer at all.
        if (!status) settle(() => reject(new Error("The connection to APNs closed before it answered")));
        else settle(() => resolve({ status, body: answer }));
      });
      request.on("error", (error) => settle(() => reject(error)));
      // A connection that dies before the answer ends the stream without an 'end'.
      request.on("close", () => settle(() => reject(new Error("The connection to APNs closed before it answered"))));
      request.setTimeout(timeoutMs, () => {
        settle(() => reject(new ApnsTimeoutError()));
        request.close(http2.constants.NGHTTP2_CANCEL);
      });
      request.end(body);
    });
  }

  const send: ApnsSender = async ({ token: deviceToken, environment }, payload) => {
    const origin = origins[environment];
    const path = `/3/device/${encodeURIComponent(deviceToken)}`;
    const body = apnsBody(payload);

    for (let attempt = 1; ; attempt++) {
      const headers = {
        authorization: `bearer ${token()}`,
        "apns-topic": config.topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(now() / 1000) + TTL_SECONDS),
        "apns-collapse-id": collapseId(payload.tag),
        "content-type": "application/json",
      };

      let answer: { status: number; body: string };
      try {
        answer = await post(origin, path, headers, body);
      } catch (error) {
        // Apple closes idle connections, so the first request on a stale one can fail without
        // Apple having refused anything: try again on a new connection. If it did get through
        // after all, the collapse ID makes the second one replace the first on the phone.
        if (attempt === 1 && !(error instanceof ApnsTimeoutError)) {
          dropSession(origin);
          continue;
        }
        throw error;
      }
      if (answer.status === 200) return;

      let reason: string | null = null;
      try {
        const parsed = JSON.parse(answer.body) as { reason?: unknown };
        reason = typeof parsed.reason === "string" ? parsed.reason : null;
      } catch {
        // Not JSON: the status will have to do.
      }
      // Our provider token went stale (a clock that drifted): sign a fresh one and try once more.
      if (answer.status === 403 && reason === "ExpiredProviderToken" && attempt === 1) {
        providerToken = null;
        continue;
      }
      throw new ApnsError(answer.status, reason);
    }
  };

  return {
    send,
    close() {
      for (const session of sessions.values()) session.destroy();
      sessions.clear();
    },
  };
}

/** True when Apple says the token is no good any more: the app was deleted, or the token isn't for this app. */
export function isDeviceGone(error: unknown): boolean {
  if (!(error instanceof ApnsError)) return false;
  return (
    error.statusCode === 410 ||
    (error.statusCode === 400 && (error.reason === "BadDeviceToken" || error.reason === "DeviceTokenNotForTopic"))
  );
}

/** Reads the key and IDs from the environment: null when none are set, an error when only some are. */
function configFromEnv(): ApnsConfig | null {
  const { APNS_KEY, APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC } = env;
  const anySet = Boolean(APNS_KEY || APNS_KEY_PATH || APNS_KEY_ID || APNS_TEAM_ID);
  if (!anySet) return null;
  if (!(APNS_KEY || APNS_KEY_PATH) || !APNS_KEY_ID || !APNS_TEAM_ID) {
    throw new Error(
      "Apple push is only partly configured: set APNS_KEY (or APNS_KEY_PATH), APNS_KEY_ID and APNS_TEAM_ID, or none of them.",
    );
  }

  let key: KeyObject;
  try {
    const pem = APNS_KEY ? APNS_KEY.replace(/\\n/g, "\n") : readFileSync(APNS_KEY_PATH!, "utf8");
    key = createPrivateKey(pem);
  } catch (error) {
    throw new Error(`The Apple push key can't be read (APNS_KEY / APNS_KEY_PATH): ${(error as Error).message}`);
  }
  if (key.asymmetricKeyType !== "ec") throw new Error("The Apple push key must be an EC key (the .p8 file from Apple).");

  return { key, keyId: APNS_KEY_ID, teamId: APNS_TEAM_ID, topic: APNS_TOPIC ?? "com.nouzy5.friendshipwrapped" };
}

const config = configFromEnv();
const connection = config ? createApnsSender(config) : null;

/** Null while Apple push is off: no key configured. */
let sender: ApnsSender | null = connection?.send ?? null;

export function apnsSender(): ApnsSender | null {
  return sender;
}

/** Swaps the sender: tests use a fake one (and null turns Apple push off again). */
export function setApnsSender(next: ApnsSender | null): void {
  sender = next;
}

/** Whether the server can deliver to iPhones, which the app asks before offering notifications. */
export function apnsEnabled(): boolean {
  return sender !== null;
}

/** Closes the connections to Apple (on shutdown). */
export function closeApns(): void {
  connection?.close();
}

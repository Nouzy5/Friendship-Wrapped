import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api-client";

/** Push needs a service worker, the Push API and notification permission (iOS: only once added to the Home Screen). */
export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Registered once at start-up; it also caches photos for "Saved on this phone". */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js").catch(() => {
    // The app works without it, just without push and the photo cache.
  });
}

async function fetchPushKey(): Promise<string | null> {
  const { publicKey } = await apiRequest<{ publicKey: string | null }>("/notifications/push-key");
  return publicKey;
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sendSubscription(subscription: PushSubscription): Promise<void> {
  const { endpoint, keys } = subscription.toJSON();
  await apiRequest("/notifications/subscriptions", { method: "POST", body: { endpoint, keys } });
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export type PushState = "unsupported" | "unavailable" | "denied" | "off" | "on";

/** Asks for permission (if needed) and registers this device. Throws a readable Error on failure. */
export async function turnOnPush(): Promise<void> {
  if (!pushSupported()) throw new Error("This browser can't show notifications.");
  const publicKey = await fetchPushKey();
  if (!publicKey) throw new Error("Notifications aren't set up on the server yet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in your browser or phone settings.");
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await sendSubscription(subscription);
}

/** Stops this device receiving pushes (e.g. on sign-out). Never throws. */
export async function turnOffPush(): Promise<void> {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await apiRequest("/notifications/subscriptions", { method: "DELETE", body: { endpoint: subscription.endpoint } }).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // Already gone.
  }
}

/** Whether this device gets pushes, for the Notifications screen. */
export function usePushState(): [PushState | undefined, () => void] {
  const [state, setState] = useState<PushState>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let next: PushState;
      if (!pushSupported()) next = "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const [key, subscription] = await Promise.all([fetchPushKey().catch(() => null), currentSubscription().catch(() => null)]);
        next = !key ? "unavailable" : subscription && Notification.permission === "granted" ? "on" : "off";
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  return [state, () => setVersion((value) => value + 1)];
}

/** Re-sends this device's subscription once per visit, in case the server lost it or it was renewed. */
export function useKeepPushSubscription(): void {
  useEffect(() => {
    if (!pushSupported() || Notification.permission !== "granted") return;
    void currentSubscription()
      .then((subscription) => (subscription ? sendSubscription(subscription) : undefined))
      .catch(() => undefined);
  }, []);
}

/** "Saved on this phone": what the service worker has cached, and emptying it. */
export async function savedPhotosSize(): Promise<number | null> {
  if (!("caches" in window) || !(await caches.has("fw-photos-v1"))) return 0;
  const estimate = await navigator.storage?.estimate?.();
  return estimate?.usage ?? null;
}

export async function clearSavedPhotos(): Promise<void> {
  if ("caches" in window) await caches.delete("fw-photos-v1");
}

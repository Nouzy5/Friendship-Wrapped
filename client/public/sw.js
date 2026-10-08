/*
 * Friendship Wrapped service worker.
 * - Shows push notifications (photos, reactions, comments, members, On this day, Wrapped) and opens
 *   the right page when one is tapped.
 * - Keeps photos you've seen on this device (photo images never change once posted), which is what
 *   Settings → Photos & data → "Saved on this phone" counts and "Clear saved photos" empties.
 */
const PHOTO_CACHE = "fw-photos-v1";
const PHOTO_IMAGE = /^\/api\/photos\/[^/]+\/images\/(thumbnail|medium|full)$/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !PHOTO_IMAGE.test(url.pathname) || url.search) return;

  event.respondWith(
    caches.open(PHOTO_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    }),
  );
});

self.addEventListener("message", (event) => {
  // Sent on sign-out and by "Clear saved photos".
  if (event.data && event.data.type === "clear-photos") event.waitUntil(caches.delete(PHOTO_CACHE));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Friendship Wrapped", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Friendship Wrapped";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/home" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/home", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) return open.focus().then(() => open.navigate(target));
      return self.clients.openWindow(target);
    }),
  );
});

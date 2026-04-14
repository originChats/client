// fallow-ignore-file unused-file
/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

// ── Workbox precache (injected by VitePWA at build time) ─────────────────────
// __WB_MANIFEST is replaced by the list of precache entries.
self.skipWaiting();
self.clients.claim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api/],
  })
);

registerRoute(/\/.*\.json$/, new StaleWhileRevalidate({ cacheName: "json-cache" }), "GET");

// ── Web Push ──────────────────────────────────────────────────────────────────

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; channelName?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "OriginChats", body: event.data.text() };
  }

  const title = payload.title ?? "OriginChats";
  const options: NotificationOptions & { renotify?: boolean } = {
    body: payload.body ?? "",
    icon: "/dms.png",
    badge: "/dms.png",
    tag: payload.channelName ?? "originchats",
    data: { channelName: payload.channelName },
    renotify: true,
  };

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Don't show a push notification if the user already has a focused tab open
      const hasFocusedTab = clientList.some((client) => (client as WindowClient).focused);
      if (hasFocusedTab) return;
      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if one is open
      for (const client of clientList) {
        if ("focus" in client) return (client as WindowClient).focus();
      }
      // Otherwise open a new window
      return self.clients.openWindow("/");
    })
  );
});

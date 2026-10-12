// Minimal service worker: makes the app installable and shows a friendly page when offline.
// Pages are always fetched fresh (orders change constantly), so nothing personal is cached.
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("tc-v1").then((c) => c.add(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
  }
});

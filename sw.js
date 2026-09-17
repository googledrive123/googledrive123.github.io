/**
 * Minimal service worker. It caches nothing and answers nothing — the fetch
 * handler exists because Chrome will not fire `beforeinstallprompt` without
 * one, and that event is what powers the Install button in settings.
 *
 * Leaving respondWith() uncalled means every request goes to the network
 * exactly as it would with no service worker at all.
 */
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function () {});

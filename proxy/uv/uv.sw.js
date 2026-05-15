importScripts('/proxy/uv/uv.bundle.js');
importScripts('/proxy/uv/uv.config.js');

const sw = new UVServiceWorker();

self.addEventListener('fetch', (event) =>
  event.respondWith(sw.fetch(event))
);

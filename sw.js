self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const JS_MIME  = 'application/javascript';
const CSS_MIME = 'text/css';
const WASM_MIME = 'application/wasm';

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (!url.includes('raw.githubusercontent.com')) return;

  e.respondWith(
    fetch(e.request).then(res => {
      let mime = null;
      if (url.endsWith('.js'))   mime = JS_MIME;
      else if (url.endsWith('.css'))  mime = CSS_MIME;
      else if (url.endsWith('.wasm')) mime = WASM_MIME;
      if (!mime) return res;

      const headers = new Headers(res.headers);
      headers.set('Content-Type', mime);
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    })
  );
});

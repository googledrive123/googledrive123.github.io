/**
 * Cloudflare Pages Function — proxy backend
 *
 * HOW TO DEPLOY:
 * 1. Create a new GitHub repo, put this file at functions/[[path]].js
 *    (the double brackets are intentional — it catches all routes)
 * 2. Go to dash.cloudflare.com → Pages → Create a project → Connect to Git
 * 3. Select your repo, leave build settings blank, hit Deploy
 * 4. You'll get a URL like https://my-proxy.pages.dev
 * 5. In proxy/uv.sw.js change CORS_BACKEND to that URL with a trailing slash:
 *      'https://my-proxy.pages.dev/'
 *
 * pages.dev is separate from workers.dev and almost never blocked by school filters.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
};

const STRIP = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'x-content-type-options',
  'strict-transport-security',
  'content-encoding',
  'transfer-encoding',
]);

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

async function handleProxy(context) {
  const req       = context.request;
  const targetURL = req.headers.get('x-target');
  const method    = req.headers.get('x-method') || req.method;

  if (!targetURL) {
    return new Response('Missing x-target', { status: 400, headers: CORS });
  }

  let targetOrigin = '';
  try { targetOrigin = new URL(targetURL).origin; } catch {
    return new Response('Invalid target URL', { status: 400, headers: CORS });
  }

  const fwd = new Headers({
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          req.headers.get('accept')          || '*/*',
    'Accept-Language': req.headers.get('accept-language') || 'en-US,en;q=0.9',
    'Origin':          targetOrigin,
    'Referer':         targetURL,
    'sec-fetch-site':  'same-origin',
    'sec-fetch-mode':  'navigate',
    'sec-fetch-dest':  'document',
  });

  for (const h of ['content-type', 'cookie', 'range', 'authorization']) {
    const v = req.headers.get(h);
    if (v) fwd.set(h, v);
  }

  // Handle WebSocket upgrade
  const upgradeHeader = req.headers.get('upgrade') || '';
  if (upgradeHeader.toLowerCase() === 'websocket') {
    const wsTarget = new URL(req.url).searchParams.get('target');
    if (!wsTarget) return new Response('Missing target', { status: 400, headers: CORS });

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();

    const upstream = new WebSocket(wsTarget);
    upstream.addEventListener('message', (e) => server.send(e.data));
    upstream.addEventListener('close',   (e) => server.close(e.code, e.reason));
    server.addEventListener('message',   (e) => upstream.send(e.data));
    server.addEventListener('close',     ()  => upstream.close());

    return new Response(null, { status: 101, webSocket: client });
  }

  let upstream;
  try {
    upstream = await fetch(targetURL, {
      method,
      headers: fwd,
      body: (method !== 'GET' && method !== 'HEAD') ? req.body : undefined,
      redirect: 'follow',
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 502, headers: { ...CORS, 'content-type': 'application/json' } }
    );
  }

  const resHeaders = new Headers(CORS);
  for (const [k, v] of upstream.headers.entries()) {
    if (!STRIP.has(k.toLowerCase())) resHeaders.set(k, v);
  }

  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}

export const onRequestGet  = handleProxy;
export const onRequestPost = handleProxy;
export const onRequestHead = handleProxy;

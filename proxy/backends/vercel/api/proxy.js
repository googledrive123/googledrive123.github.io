/**
 * Vercel Edge Function — proxy backend
 *
 * HOW TO DEPLOY:
 * 1. Create a new GitHub repo (e.g. "my-proxy-backend"), put this file at api/proxy.js
 * 2. Go to vercel.com → New Project → import that repo → Deploy
 * 3. You'll get a URL like https://my-proxy-backend.vercel.app
 * 4. In proxy/uv.sw.js change CORS_BACKEND to:
 *      'https://my-proxy-backend.vercel.app/api/proxy/'
 *    (make sure to include /api/proxy/ and keep the trailing slash)
 *
 * Vercel free tier: unlimited edge requests, global CDN, no credit card needed.
 */

export const config = { runtime: 'edge' };

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

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

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
    'Origin':          targetOrigin,   // spoof origin so APIs don't reject us
    'Referer':         targetURL,
    'sec-fetch-site':  'same-origin',
    'sec-fetch-mode':  'navigate',
    'sec-fetch-dest':  'document',
  });

  for (const h of ['content-type', 'cookie', 'range', 'authorization']) {
    const v = req.headers.get(h);
    if (v) fwd.set(h, v);
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
      JSON.stringify({ error: String(err), target: targetURL }),
      { status: 502, headers: { ...CORS, 'content-type': 'application/json' } }
    );
  }

  const resHeaders = new Headers(CORS);
  for (const [k, v] of upstream.headers.entries()) {
    if (!STRIP.has(k.toLowerCase())) resHeaders.set(k, v);
  }

  return new Response(upstream.body, {
    status:  upstream.status,
    headers: resHeaders,
  });
}

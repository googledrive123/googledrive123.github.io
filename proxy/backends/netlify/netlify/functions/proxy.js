/**
 * Netlify Edge Function — proxy backend
 *
 * HOW TO DEPLOY:
 * 1. Create a new GitHub repo with this file at netlify/functions/proxy.js
 *    Also add a netlify.toml at the root (contents below in the comment)
 * 2. Go to app.netlify.com → Add new site → Import from Git
 * 3. Select your repo → Deploy
 * 4. You'll get a URL like https://cool-name-abc123.netlify.app
 * 5. In proxy/uv.sw.js change CORS_BACKEND to:
 *      'https://cool-name-abc123.netlify.app/.netlify/functions/proxy/'
 *
 * ── netlify.toml (put this at repo root) ─────────────────────────────────────
 * [build]
 *   functions = "netlify/functions"
 *
 * [[redirects]]
 *   from = "/*"
 *   to = "/.netlify/functions/proxy"
 *   status = 200
 * ─────────────────────────────────────────────────────────────────────────────
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

export default async (req, context) => {
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
    'Origin':          targetOrigin,
    'Referer':         targetURL,
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
      JSON.stringify({ error: String(err) }),
      { status: 502, headers: { ...CORS, 'content-type': 'application/json' } }
    );
  }

  const resHeaders = new Headers(CORS);
  for (const [k, v] of upstream.headers.entries()) {
    if (!STRIP.has(k.toLowerCase())) resHeaders.set(k, v);
  }

  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
};

export const config = { path: '/*' };

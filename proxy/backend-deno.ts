/**
 * proxy/backend-deno.ts
 *
 * Deploy this to https://dash.deno.com/new  (free, no credit card)
 * 1. Go to dash.deno.com → New Playground
 * 2. Paste this entire file
 * 3. Click Deploy
 * 4. Copy the *.deno.dev URL you get
 * 5. Update CORS_BACKEND in proxy/uv.sw.js to that URL (keep trailing slash)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
};

// Headers we strip from upstream responses
const STRIP_RESPONSE = new Set([
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "x-content-type-options",
  "strict-transport-security",
  "content-encoding",       // we stream body as-is, encoding would corrupt it
  "transfer-encoding",
]);

Deno.serve(async (req: Request): Promise<Response> => {
  // ── CORS preflight ────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ── WebSocket proxy ───────────────────────────────────────────────────────
  const upgradeHeader = req.headers.get("upgrade") ?? "";
  if (upgradeHeader.toLowerCase() === "websocket") {
    const target = new URL(req.url).searchParams.get("target");
    if (!target) {
      return new Response("Missing ?target= param", { status: 400 });
    }

    const { socket: client, response } = Deno.upgradeWebSocket(req);
    let upstream: WebSocket | null = null;
    const clientQueue: (string | ArrayBuffer)[] = [];

    client.onopen = () => {
      upstream = new WebSocket(target);
      upstream.binaryType = "arraybuffer";

      upstream.onopen = () => {
        // flush anything the client sent before upstream was ready
        for (const msg of clientQueue) upstream!.send(msg);
        clientQueue.length = 0;
      };
      upstream.onmessage = (e) => {
        if (client.readyState === WebSocket.OPEN) client.send(e.data);
      };
      upstream.onclose = (e) => client.close(e.code, e.reason);
      upstream.onerror = () => client.close(1011, "upstream error");
    };

    client.onmessage = (e) => {
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.send(e.data);
      } else {
        clientQueue.push(e.data);
      }
    };
    client.onclose = () => upstream?.close();

    return response;
  }

  // ── HTTP proxy ────────────────────────────────────────────────────────────
  const targetURL = req.headers.get("x-target");
  const method    = req.headers.get("x-method") ?? req.method;

  if (!targetURL) {
    return new Response("Missing x-target header", { status: 400, headers: CORS_HEADERS });
  }

  let targetOrigin = "";
  let targetHostname = "";
  try {
    const u = new URL(targetURL);
    targetOrigin  = u.origin;
    targetHostname = u.hostname;
  } catch {
    return new Response("Invalid x-target URL", { status: 400, headers: CORS_HEADERS });
  }

  // Build forwarded headers — look like a real browser, spoof Origin/Referer
  const fwd = new Headers({
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          req.headers.get("accept")          ?? "*/*",
    "Accept-Language": req.headers.get("accept-language") ?? "en-US,en;q=0.9",
    "Origin":          targetOrigin,
    "Referer":         targetURL,
    "sec-fetch-site":  "same-origin",
    "sec-fetch-mode":  "navigate",
    "sec-fetch-dest":  "document",
  });

  for (const h of ["content-type", "range", "cookie", "authorization"]) {
    const v = req.headers.get(h);
    if (v) fwd.set(h, v);
  }

  const hasBody = method !== "GET" && method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(targetURL, {
      method,
      headers: fwd,
      body: hasBody ? req.body : undefined,
      redirect: "follow",
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), target: targetURL }),
      { status: 502, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  }

  // Build response headers
  const resHeaders = new Headers(CORS_HEADERS);
  for (const [k, v] of upstream.headers.entries()) {
    if (!STRIP_RESPONSE.has(k.toLowerCase())) {
      resHeaders.set(k, v);
    }
  }

  return new Response(upstream.body, {
    status:  upstream.status,
    headers: resHeaders,
  });
});

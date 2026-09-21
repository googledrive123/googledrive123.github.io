// ICE servers for PolyTrack rooms.
//
// WebRTC connects the two players directly when it can. On a lot of school and
// office networks it cannot, because they block the traffic it uses, and the
// only way through is a TURN relay that forwards the connection.
//
// A relay needs credentials, and credentials cannot ship in a public repo, so
// they are minted here instead. Cloudflare issues short lived ones from a
// long lived key; the key stays in this function's environment and the browser
// only ever sees credentials that expire.
//
// With no key configured this still answers, with public STUN. Rooms then work
// on ordinary home connections and fail on the restrictive ones, which is
// exactly where things stood before this existed.
//
// Deployed to Supabase as the edge function "ice-servers". This file is the
// record of what is running; it is not loaded by the page. Set CF_TURN_KEY_ID
// and CF_TURN_API_TOKEN in the function's secrets to turn the relay on.

const ALLOWED_ORIGINS = [
  'https://googledrive123.github.io',
  'http://127.0.0.1:8000',
  'http://localhost:8000'
];

// Mirrors public.gv_allowed_origins() in the database. Two runtimes, so the
// list is written twice; change both together.
const STUN_ONLY = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];

// Rooms last minutes. Two hours is far longer than any of them and well under
// the 48 hour ceiling Cloudflare allows.
const TTL_SECONDS = 7200;

function headersFor(origin: string) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') ?? '';
  const headers = headersFor(origin);

  if (request.method === 'OPTIONS') return new Response('ok', { headers });

  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ error: 'origin not allowed' }), { status: 403, headers });
  }

  const keyId = Deno.env.get('CF_TURN_KEY_ID');
  const token = Deno.env.get('CF_TURN_API_TOKEN');
  if (!keyId || !token) {
    return new Response(JSON.stringify(STUN_ONLY), { headers });
  }

  try {
    const minted = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_SECONDS })
      }
    );

    if (!minted.ok) {
      console.error('Cloudflare TURN refused:', minted.status, await minted.text());
      return new Response(JSON.stringify(STUN_ONLY), { headers });
    }

    const body = await minted.json();
    const servers = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];

    // A relay that cannot be reached is worse than no relay: the browser waits
    // on it before giving up. Port 53 is blocked outright in browsers, so it
    // is dropped rather than left to time out.
    const usable = servers
      .filter((server: unknown) => server && typeof server === 'object')
      .map((server: { urls?: string | string[] }) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return { ...server, urls: urls.filter((url) => typeof url === 'string' && !url.includes(':53?')) };
      })
      .filter((server: { urls: string[] }) => server.urls.length > 0);

    return new Response(JSON.stringify(usable.length > 0 ? usable : STUN_ONLY), { headers });
  } catch (error) {
    console.error('Could not mint TURN credentials:', error);
    return new Response(JSON.stringify(STUN_ONLY), { headers });
  }
});

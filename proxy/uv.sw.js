/*  proxy/uv.sw.js  —  self-contained service worker proxy  */

const PROXY_PREFIX = '/proxy/service/';

// ── Backend config ───────────────────────────────────────────────────────────
//
// BACKEND_MODE controls how the SW talks to the backend:
//   'headers' → CF Worker / Vercel / Netlify / Deno  (sends x-target header)
//   'gas'     → Google Apps Script                   (sends JSON body, unwraps envelope)
//
// CORS_BACKEND is the URL. Keep the trailing slash for 'headers' mode.
// For 'gas' mode use the exact script.google.com URL with no trailing slash.
//
// ── Option A: Cloudflare Worker (may be blocked on school wifi) ──────────────
//   const BACKEND_MODE = 'headers';
//   const CORS_BACKEND = 'https://googledrive123.gogledriven123.workers.dev/';
//
// ── Option B: Cloudflare Pages  (*.pages.dev — often unblocked) ─────────────
//   const BACKEND_MODE = 'headers';
//   const CORS_BACKEND = 'https://YOUR-PROJECT.pages.dev/';
//
// ── Option C: Vercel            (*.vercel.app) ───────────────────────────────
//   const BACKEND_MODE = 'headers';
//   const CORS_BACKEND = 'https://YOUR-PROJECT.vercel.app/api/proxy/';
//
// ── Option D: Netlify           (*.netlify.app) ──────────────────────────────
//   const BACKEND_MODE = 'headers';
//   const CORS_BACKEND = 'https://YOUR-PROJECT.netlify.app/';
//
// ── Option E: Google Apps Script (UNBLOCKABLE on school Chromebooks) ─────────
//   const BACKEND_MODE = 'gas';
//   const CORS_BACKEND = 'https://script.google.com/macros/s/YOUR_ID/exec';
//   Deploy: see proxy/backends/google-apps-script/Code.gs for instructions
//
const BACKEND_MODE = 'gas';
const CORS_BACKEND = 'https://script.google.com/macros/s/AKfycbzkilZkUNHLdVDsKZgLKUIKpXv27jMCixzJxBGfjm5kba2iw0mmr0b7UX4xdJYATIUc/exec';

// Hostnames whose assets the SW fetches directly (not through the Worker).
const DIRECT_CDN_HOSTS = [
  'cdn.discordapp.com',
  'cdn.prod.website-files.com',
  'static.cdninstagram.com',
  'static.cloudflareinsights.com',
  'i.ytimg.com',
  'yt3.ggpht.com',
  'lh3.googleusercontent.com',
  'pbs.twimg.com',
  'abs.twimg.com',
  'video.twimg.com',
  'scontent.cdninstagram.com',
];

// File extensions safe to fetch directly (images, fonts, media)
const DIRECT_EXT = /\.(webp|png|jpg|jpeg|gif|avif|mp4|webm|m4a|mp3|ogg)(\?.*)?$/i;

// Discord hosts fonts/icons at discord.com/assets/ — fetch these directly
const DISCORD_DIRECT_EXT = /\.(woff2?|ttf|eot|otf|svg|ico|png|jpg|webp|gif)(\?.*)?$/i;

function shouldFetchDirect(url) {
  try {
    const u = new URL(url);
    if (DIRECT_CDN_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) return true;
    if (DIRECT_EXT.test(u.pathname)) return true;
    if ((u.hostname === 'discord.com' || u.hostname.endsWith('.discord.com'))
        && u.pathname.startsWith('/assets/')
        && DISCORD_DIRECT_EXT.test(u.pathname)) return true;
  } catch { /* ignore */ }
  return false;
}

// ── URL codec (URL-safe base64) ─────────────────────────────────────────────
function encode(url) {
  return btoa(unescape(encodeURIComponent(url)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  try { return decodeURIComponent(escape(atob(str))); } catch { return atob(str); }
}

function toProxyURL(url) {
  return PROXY_PREFIX + encode(url);
}

// ── HTML / CSS rewriters ────────────────────────────────────────────────────
function rewriteHTML(html, base) {
  // Strip <base> tags — they hijack URL resolution and send everything to the wrong origin
  html = html.replace(/<base\b[^>]*>/gi, '');

  html = html.replace(
    /\b(src|href|action|data-src|data-href)=(["'])([^"']*?)\2/gi,
    (m, attr, q, url) => {
      if (!url || /^(data:|javascript:|#|about:|blob:)/i.test(url)) return m;
      if (url.startsWith(PROXY_PREFIX)) return m;
      try {
        const abs = new URL(url, base).href;
        if (shouldFetchDirect(abs)) return m;
        return `${attr}=${q}${toProxyURL(abs)}${q}`;
      } catch { return m; }
    }
  );

  html = html.replace(
    /\b(src|href|action)=([^\s>"']+)/gi,
    (m, attr, url) => {
      if (/^(data:|javascript:|#|about:|blob:)/i.test(url)) return m;
      if (url.startsWith(PROXY_PREFIX)) return m;
      try {
        const abs = new URL(url, base).href;
        if (shouldFetchDirect(abs)) return m;
        return `${attr}="${toProxyURL(abs)}"`;
      } catch { return m; }
    }
  );

  return html;
}

function rewriteCSS(css, base) {
  return css.replace(/url\(["']?([^"')]+)["']?\)/gi, (m, url) => {
    if (/^(data:|#)/i.test(url)) return m;
    try {
      const abs = new URL(url, base).href;
      if (shouldFetchDirect(abs)) return m;
      return `url("${toProxyURL(abs)}")`;
    } catch { return m; }
  });
}

// Runtime script injected into every proxied HTML page
function runtimeScript(base) {
  return `<script>(function(){
  var _P='${PROXY_PREFIX}';
  var _enc=function(u){return btoa(unescape(encodeURIComponent(u))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=/g,'');};
  var _toP=function(u){
    try{
      var abs=new URL(u,'${base}').href;
      var directHosts=${JSON.stringify(DIRECT_CDN_HOSTS)};
      try{ var h=new URL(abs).hostname; if(directHosts.some(function(d){return h===d||h.endsWith('.'+d);})) return u; }catch(e){}
      if(/\\.(webp|png|jpg|jpeg|gif|svg|ico|avif|mp4|webm|m4a|mp3|ogg|woff2?|ttf|eot|otf)(\\?.*)?$/i.test(new URL(abs).pathname)) return u;
      return _P+_enc(abs);
    }catch(e){return u;}
  };

  // XHR proxy
  var _xopen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,url){
    try{if(typeof url==='string'&&!/^(data:|blob:|javascript:)/.test(url)&&!url.startsWith(_P))url=_toP(url);}catch(e){}
    return _xopen.apply(this,[m,url].concat([].slice.call(arguments,2)));
  };

  // fetch proxy
  var _fetch=window.fetch;
  window.fetch=function(input,opts){
    try{
      if(typeof input==='string'&&!/^(data:|blob:|javascript:)/.test(input)&&!input.startsWith(_P))input=_toP(input);
      else if(input&&typeof input==='object'&&input.url){
        var _ru=_toP(input.url);
        if(_ru!==input.url) input=new Request(_ru,input);
      }
    }catch(e){}
    return _fetch.call(this,input,opts);
  };

  // Intercept script.src setter — catches webpack chunk loading and dynamic script injection
  try{
    var _ssd=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,'src');
    if(_ssd&&_ssd.set){
      var _sss=_ssd.set;
      Object.defineProperty(HTMLScriptElement.prototype,'src',{
        get:_ssd.get,
        set:function(v){
          try{if(typeof v==='string'&&v&&!/^(data:|blob:|javascript:)/.test(v)&&!v.startsWith(_P))v=_toP(v);}catch(e){}
          _sss.call(this,v);
        },
        configurable:true
      });
    }
  }catch(e){}

  // Intercept link.href setter — catches dynamic stylesheet injection
  try{
    var _lhd=Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype,'href');
    if(_lhd&&_lhd.set){
      var _lhs=_lhd.set;
      Object.defineProperty(HTMLLinkElement.prototype,'href',{
        get:_lhd.get,
        set:function(v){
          try{
            var rel=(this.getAttribute('rel')||'').toLowerCase();
            if(typeof v==='string'&&v&&!/^(data:|blob:|javascript:)/.test(v)&&!v.startsWith(_P)&&rel!=='canonical')v=_toP(v);
          }catch(e){}
          _lhs.call(this,v);
        },
        configurable:true
      });
    }
  }catch(e){}

  // Intercept location.assign and location.replace
  try{
    var _la=location.assign.bind(location);
    var _lr=location.replace.bind(location);
    location.assign=function(url){
      try{if(typeof url==='string'&&!/^(data:|blob:|javascript:|#)/.test(url)&&!url.startsWith(_P))url=_toP(url);}catch(e){}
      _la(url);
    };
    location.replace=function(url){
      try{if(typeof url==='string'&&!/^(data:|blob:|javascript:|#)/.test(url)&&!url.startsWith(_P))url=_toP(url);}catch(e){}
      _lr(url);
    };
  }catch(e){}

  // Intercept window.open
  try{
    var _wo=window.open;
    window.open=function(url,t,f){
      try{if(typeof url==='string'&&url&&!/^(data:|blob:|javascript:)/.test(url)&&!url.startsWith(_P))url=_toP(url);}catch(e){}
      return _wo.call(window,url,t,f);
    };
  }catch(e){}

  // Click handler — catches <a href> navigations
  document.addEventListener('click',function(e){
    var a=e.target.closest('a[href]');
    if(!a)return;
    var h=a.getAttribute('href');
    if(!h||/^(#|javascript:|data:|blob:)/.test(h))return;
    try{
      var abs=new URL(h,'${base}').href;
      if(abs.startsWith(location.origin+_P))return;
      e.preventDefault();
      location.href=_P+_enc(abs);
    }catch(err){}
  },true);

  // Form submit handler
  document.addEventListener('submit',function(e){
    var f=e.target;
    var action=f.action||'${base}';
    try{
      var abs=new URL(action,'${base}').href;
      e.preventDefault();
      var params=new URLSearchParams(new FormData(f)).toString();
      var dest=abs+(f.method.toUpperCase()==='GET'?(abs.includes('?')?'&':'?')+params:'');
      location.href=_P+_enc(dest);
    }catch(err){}
  },true);

  // ── WebSocket proxy ──────────────────────────────────────────────────────
  var _WS = window.WebSocket;
  var _wsBackend = '${CORS_BACKEND}'.replace(/^https?/,'wss').replace(/https?/,'wss').replace(/\/$/,'');
  window.WebSocket = function(url, protocols) {
    try {
      var proxied = _wsBackend + '?target=' + encodeURIComponent(url);
      var ws = protocols ? new _WS(proxied, protocols) : new _WS(proxied);
      return ws;
    } catch(e) {
      return protocols ? new _WS(url, protocols) : new _WS(url);
    }
  };
  window.WebSocket.prototype  = _WS.prototype;
  window.WebSocket.CONNECTING = _WS.CONNECTING;
  window.WebSocket.OPEN       = _WS.OPEN;
  window.WebSocket.CLOSING    = _WS.CLOSING;
  window.WebSocket.CLOSED     = _WS.CLOSED;

  // history.pushState / replaceState
  var _push=history.pushState.bind(history);
  history.pushState=function(s,t,url){
    try{if(url&&url!=='#'&&!url.startsWith(_P))url=_toP(url);}catch(e){}
    return _push(s,t,url);
  };
  var _replace=history.replaceState.bind(history);
  history.replaceState=function(s,t,url){
    try{if(url&&url!=='#'&&!url.startsWith(_P))url=_toP(url);}catch(e){}
    return _replace(s,t,url);
  };
})();<\/script>`;
}

// ── Cookie store (per hostname) ─────────────────────────────────────────────
const cookieStore = new Map(); // hostname → cookie string

function getCookies(hostname) {
  return cookieStore.get(hostname) || '';
}

function storeCookies(hostname, setCookieHeader) {
  if (!setCookieHeader) return;
  const existing = new Map();
  const current = cookieStore.get(hostname) || '';
  for (const part of current.split(';').map(s => s.trim()).filter(Boolean)) {
    const [k] = part.split('=');
    existing.set(k.trim(), part);
  }
  for (const cookie of setCookieHeader.split(/,(?=[^;]+=[^;]*)/)) {
    const nameVal = cookie.split(';')[0].trim();
    const [k] = nameVal.split('=');
    existing.set(k.trim(), nameVal);
  }
  cookieStore.set(hostname, [...existing.values()].join('; '));
}

// ── Lifecycle — force immediate activation on update ────────────────────────
self.addEventListener('install',  ()  => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

// ── Fetch handler ───────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(PROXY_PREFIX)) return;

  const encoded = url.pathname.slice(PROXY_PREFIX.length);
  let target;
  try { target = decode(encoded); } catch { return; }

  if (url.search && !target.includes('?')) target += url.search;

  event.respondWith(proxyFetch(target, event.request));
});

async function proxyFetch(targetURL, req) {
  try {
    // Direct CDN assets — fetch without proxy, avoids 403/413
    if (shouldFetchDirect(targetURL)) {
      const direct = await fetch(targetURL, {
        headers: { 'accept': req.headers.get('accept') || '*/*' },
      });
      return new Response(direct.body, {
        status: direct.status,
        headers: { 'Content-Type': direct.headers.get('content-type') || 'application/octet-stream' },
      });
    }

    let targetHost;
    try { targetHost = new URL(targetURL).hostname; } catch {}

    const stored = targetHost ? getCookies(targetHost) : '';

    // ── Call backend ──────────────────────────────────────────────────────────
    let status, ct, responseText, responseBody, setCookieHeader;

    if (BACKEND_MODE === 'gas') {
      // Google Apps Script mode — sends JSON body, receives JSON envelope
      const gasPayload = JSON.stringify({
        target:      targetURL,
        method:      req.method,
        accept:      req.headers.get('accept')          || '*/*',
        acceptLang:  req.headers.get('accept-language') || 'en-US,en;q=0.9',
        contentType: req.headers.get('content-type')    || '',
        cookie:      stored,
        body:        (req.method !== 'GET' && req.method !== 'HEAD')
                       ? await req.text()
                       : null,
      });

      const gasRes = await fetch(CORS_BACKEND, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    gasPayload,
      });

      // GAS always returns HTTP 200 with a JSON envelope
      const envelope = await gasRes.json();
      status = envelope.status || 200;
      ct     = envelope.contentType || 'application/octet-stream';
      setCookieHeader = envelope.setCookie || null;

      if (envelope.encoding === 'base64') {
        // Binary content — decode base64 back to bytes
        const binary = atob(envelope.body);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        responseBody = bytes.buffer;
      } else {
        responseText = envelope.body || '';
      }

    } else {
      // Standard 'headers' mode — CF Worker / Vercel / Netlify / Deno
      const headers = new Headers({
        'x-target': targetURL,
        'x-method': req.method,
      });
      for (const h of ['accept', 'accept-language', 'content-type', 'range']) {
        if (req.headers.has(h)) headers.set(h, req.headers.get(h));
      }
      if (stored) headers.set('cookie', stored);

      const upstream = await fetch(CORS_BACKEND, {
        method:  'POST',
        headers,
        body:    req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      });

      status          = upstream.status;
      ct              = upstream.headers.get('content-type') || '';
      setCookieHeader = upstream.headers.get('set-cookie');

      // 413 = backend choked on a huge file — fall back to direct fetch
      if (status === 413) {
        try {
          const direct = await fetch(targetURL);
          return new Response(direct.body, {
            status:  direct.status,
            headers: { 'Content-Type': direct.headers.get('content-type') || 'application/javascript' },
          });
        } catch { /* fall through */ }
      }

      responseText = ct.includes('text/') || ct.includes('javascript') || ct.includes('json')
        ? await upstream.text()
        : null;
      responseBody = responseText === null ? await upstream.arrayBuffer() : null;
    }

    // Store any new cookies from either backend
    if (targetHost && setCookieHeader) storeCookies(targetHost, setCookieHeader);

    // ── Rewrite and return ────────────────────────────────────────────────────

    if (ct.includes('text/html')) {
      let text = responseText ?? new TextDecoder().decode(responseBody);
      text = rewriteHTML(text, targetURL);
      const rt = runtimeScript(targetURL);
      text = text.includes('</head>')
        ? text.replace('</head>', () => rt + '</head>')
        : rt + text;
      return new Response(text, {
        status,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (ct.includes('text/css')) {
      const text = rewriteCSS(responseText ?? new TextDecoder().decode(responseBody), targetURL);
      return new Response(text, { status, headers: { 'Content-Type': ct } });
    }

    // Everything else — pass through as-is
    return new Response(responseBody ?? responseText, {
      status,
      headers: { 'Content-Type': ct || 'application/octet-stream' },
    });

  } catch (err) {
    return new Response(
      `<html><body style="font:14px monospace;padding:2rem;background:#0f0f13;color:#ff6c6c">
        <b>Proxy error</b><br><br>${err.message}<br><br>
        <small style="color:#555">target: ${targetURL}</small>
      </body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

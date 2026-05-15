/*  proxy/uv.sw.js  —  self-contained service worker proxy  */

const PROXY_PREFIX  = '/proxy/service/';
const CORS_BACKEND  = 'https://googledrive123.gogledriven123.workers.dev/';

// CDN hostnames whose assets load fine directly (not blocked by school filters)
// Routing them through the worker causes 403s and 413s — skip the proxy for these.
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
  'instagram.fxxx1-1.fna.fbcdn.net',
];

// File extensions that are never blocked — images, fonts, audio, video
const DIRECT_EXT = /\.(webp|png|jpg|jpeg|gif|svg|ico|avif|mp4|webm|m4a|mp3|ogg|woff2?|ttf|eot|otf)(\?.*)?$/i;

function shouldFetchDirect(url) {
  try {
    const u = new URL(url);
    if (DIRECT_CDN_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) return true;
    if (DIRECT_EXT.test(u.pathname)) return true;
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
  html = html.replace(
    /\b(src|href|action|data-src|data-href)=(["'])([^"']*?)\2/gi,
    (m, attr, q, url) => {
      if (!url || /^(data:|javascript:|#|about:|blob:)/i.test(url)) return m;
      if (url.startsWith(PROXY_PREFIX)) return m;
      try {
        const abs = new URL(url, base).href;
        // Let direct-CDN assets load without proxy
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
      // skip direct CDN assets
      var directHosts=${JSON.stringify(DIRECT_CDN_HOSTS)};
      try{ var h=new URL(abs).hostname; if(directHosts.some(function(d){return h===d||h.endsWith('.'+d);})) return u; }catch(e){}
      if(/\\.(webp|png|jpg|jpeg|gif|svg|ico|avif|mp4|webm|m4a|mp3|ogg|woff2?|ttf|eot|otf)(\\?.*)?$/i.test(new URL(abs).pathname)) return u;
      return _P+_enc(abs);
    }catch(e){return u;}
  };

  var _xopen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,url){
    try{if(typeof url==='string'&&!/^(data:|blob:|javascript:|\\/)/.test(url))url=_toP(url);}catch(e){}
    return _xopen.apply(this,[m,url].concat([].slice.call(arguments,2)));
  };

  var _fetch=window.fetch;
  window.fetch=function(input,opts){
    try{if(typeof input==='string'&&!/^(data:|blob:|javascript:|\\/)/.test(input))input=_toP(input);}catch(e){}
    return _fetch.call(this,input,opts);
  };

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

  var _push=history.pushState.bind(history);
  history.pushState=function(s,t,url){
    try{if(url&&!/^(#|\\/)/.test(url))url=_toP(url);}catch(e){}
    return _push(s,t,url);
  };
})();<\/script>`;
}

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

    const corsProxy = CORS_BACKEND + encodeURIComponent(targetURL);

    const headers = new Headers();
    for (const h of ['accept', 'accept-language', 'content-type']) {
      if (req.headers.has(h)) headers.set(h, req.headers.get(h));
    }

    const upstream = await fetch(corsProxy, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    });

    const ct = upstream.headers.get('content-type') || '';

    if (ct.includes('text/html')) {
      let text = await upstream.text();
      text = rewriteHTML(text, targetURL);
      const rt = runtimeScript(targetURL);
      text = text.includes('</head>') ? text.replace('</head>', rt + '</head>') : rt + text;
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (ct.includes('text/css')) {
      const text = rewriteCSS(await upstream.text(), targetURL);
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': ct },
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
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

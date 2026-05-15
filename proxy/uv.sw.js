/*  proxy/uv.sw.js
    Self-contained service worker proxy.
    No external bundle needed — zero dependencies.

    BACKEND: set CORS_BACKEND to your Cloudflare Worker URL.
    Format:  https://your-worker.your-subdomain.workers.dev/
    The worker receives the full target URL appended to the path:
      https://your-worker.workers.dev/https://example.com/page
*/

const PROXY_PREFIX = '/proxy/service/';

const CORS_BACKEND = 'https://googledrive123.gogledriven123.workers.dev/';

// ── URL codec (URL-safe base64) ────────────────────────────────────────────
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

// ── Rewriters ──────────────────────────────────────────────────────────────
function rewriteHTML(html, base) {
  // Rewrite src / href / action / srcset attributes
  html = html.replace(
    /\b(src|href|action|data-src|data-href)=(["'])([^"']*?)\2/gi,
    (m, attr, q, url) => {
      if (!url || /^(data:|javascript:|#|about:|blob:)/i.test(url)) return m;
      if (url.startsWith(PROXY_PREFIX)) return m;
      try { return `${attr}=${q}${toProxyURL(new URL(url, base).href)}${q}`; }
      catch { return m; }
    }
  );

  // Rewrite unquoted attributes (rare but happens)
  html = html.replace(
    /\b(src|href|action)=([^\s>"']+)/gi,
    (m, attr, url) => {
      if (/^(data:|javascript:|#|about:|blob:)/i.test(url)) return m;
      if (url.startsWith(PROXY_PREFIX)) return m;
      try { return `${attr}="${toProxyURL(new URL(url, base).href)}"`; }
      catch { return m; }
    }
  );

  return html;
}

function rewriteCSS(css, base) {
  return css.replace(/url\(["']?([^"')]+)["']?\)/gi, (m, url) => {
    if (/^(data:|#)/i.test(url)) return m;
    try { return `url("${toProxyURL(new URL(url, base).href)}")`; }
    catch { return m; }
  });
}

// Injected into every HTML page — intercepts dynamic requests made by page JS
function runtimeScript(base) {
  return `<script>(function(){
  var _enc = function(u){return btoa(unescape(encodeURIComponent(u))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=/g,'');};
  var _toP  = function(u){ try { return '${PROXY_PREFIX}'+_enc(new URL(u,'${base}').href); } catch(e){ return u; } };

  // XHR
  var _xopen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m,url){
    try{ if(typeof url==='string' && !/^(data:|blob:|javascript:|\\/proxy\\/)/.test(url)) url=_toP(url); }catch(e){}
    return _xopen.apply(this,[m,url].concat([].slice.call(arguments,2)));
  };

  // fetch
  var _fetch = window.fetch;
  window.fetch = function(input,opts){
    try{ if(typeof input==='string' && !/^(data:|blob:|javascript:|\\/proxy\\/)/.test(input)) input=_toP(input); }catch(e){}
    return _fetch.call(this,input,opts);
  };

  // Navigation clicks
  document.addEventListener('click',function(e){
    var a=e.target.closest('a[href]');
    if(!a) return;
    var h=a.getAttribute('href');
    if(!h||/^(#|javascript:|data:|blob:)/.test(h)) return;
    try{
      var abs=new URL(h,'${base}').href;
      if(abs.startsWith(location.origin+'${PROXY_PREFIX}')) return;
      e.preventDefault();
      location.href='${PROXY_PREFIX}'+_enc(abs);
    }catch(err){}
  },true);

  // Form submits
  document.addEventListener('submit',function(e){
    var f=e.target;
    var action=f.action||'${base}';
    try{
      var abs=new URL(action,'${base}').href;
      e.preventDefault();
      var params=new URLSearchParams(new FormData(f)).toString();
      var dest=abs+(f.method.toUpperCase()==='GET'?(abs.includes('?')?'&':'?')+params:'');
      location.href='${PROXY_PREFIX}'+_enc(dest);
    }catch(err){}
  },true);

  // history.pushState / replaceState
  var _push=history.pushState.bind(history);
  history.pushState=function(s,t,url){
    try{ if(url&&!/^(#|\\/proxy\\/)/.test(url)) url=_toP(url); }catch(e){}
    return _push(s,t,url);
  };
})();<\/script>`;
}

// ── Fetch handler ──────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(PROXY_PREFIX)) return;

  const encoded = url.pathname.slice(PROXY_PREFIX.length);
  let target;
  try { target = decode(encoded); } catch { return; }

  // Preserve query string from the original request if the target has none
  if (url.search && !target.includes('?')) target += url.search;

  event.respondWith(proxyFetch(target, event.request));
});

async function proxyFetch(targetURL, req) {
  try {
    // Worker receives target as path: /https%3A%2F%2Fexample.com
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

    // ── HTML ──
    if (ct.includes('text/html')) {
      let text = await upstream.text();
      text = rewriteHTML(text, targetURL);
      // Inject runtime script right before </head> (or at top if missing)
      const rt = runtimeScript(targetURL);
      text = text.includes('</head>') ? text.replace('</head>', rt + '</head>') : rt + text;
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // ── CSS ──
    if (ct.includes('text/css')) {
      const text = rewriteCSS(await upstream.text(), targetURL);
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': ct },
      });
    }

    // ── JS / everything else — pass through ──
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': ct || 'application/octet-stream' },
    });

  } catch (err) {
    return new Response(
      `<html><body style="font:14px monospace;padding:2rem;background:#0f0f13;color:#ff6c6c">
        <b>Proxy error</b><br><br>${err.message}<br><br>
        <small style="color:#666">target: ${targetURL}</small>
      </body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

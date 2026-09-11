/*
 * GameVault analytics tracker
 * ---------------------------
 * Records site usage into the Supabase table `analytics_events` (insert-only
 * for the anon key; reads happen through the secret-protected RPC used by
 * /analytics). Everything here is self-contained: it hooks the existing page
 * by wrapping globals and observing the DOM, so index.html needs only the
 * <script> tag.
 *
 * Opt out on this browser:  localStorage.setItem('gv.noanalytics', '1')
 */
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  var ENDPOINT = SUPA_URL + '/rest/v1/analytics_events';
  var AUTH_LS_KEY = 'sb-dxwjxzmlezfyursysays-auth-token';

  var SESSION_IDLE_MS = 30 * 60 * 1000;   // new session after 30 min idle
  var HEARTBEAT_MS = 3 * 60 * 1000;       // "live now" ping while tab visible
  var FLUSH_MS = 2000;                    // batch window
  var MAX_EVENTS_PER_SESSION = 600;       // runaway guard

  function ls(get, key, val) {
    try {
      if (get) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
    } catch (e) { return null; }
  }
  function ss(get, key, val) {
    try {
      if (get) return sessionStorage.getItem(key);
      sessionStorage.setItem(key, val);
    } catch (e) { return null; }
  }

  // Never track from inside an iframe (games embed pages; a 404 can even nest the site itself).
  var inFrame = false; try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
  if (inFrame || ls(true, 'gv.noanalytics') === '1') { window.GVA = { track: function(){}, disabled: true }; return; }

  // ── Identity ──────────────────────────────────────────────────────────
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var s = '';
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }

  var visitorId = ls(true, 'gv.vid');
  var isNewVisitor = false;
  if (!visitorId) {
    visitorId = uuid();
    isNewVisitor = true;
    ls(false, 'gv.vid', visitorId);
    ls(false, 'gv.first_seen', new Date().toISOString());
  }

  var now = Date.now();
  var sessionId = ss(true, 'gv.sid');
  var lastActive = parseInt(ss(true, 'gv.sid_last') || '0', 10);
  var sessionStart = parseInt(ss(true, 'gv.sid_start') || '0', 10);
  var isNewSession = false;
  if (!sessionId || !lastActive || now - lastActive > SESSION_IDLE_MS) {
    sessionId = uuid();
    sessionStart = now;
    isNewSession = true;
    ss(false, 'gv.sid', sessionId);
    ss(false, 'gv.sid_start', String(now));
    ss(false, 'gv.sid_n', '0');
    var visits = parseInt(ls(true, 'gv.visits') || '0', 10) + 1;
    ls(false, 'gv.visits', String(visits));
  }
  var visitCount = parseInt(ls(true, 'gv.visits') || '1', 10);
  function touchSession() { ss(false, 'gv.sid_last', String(Date.now())); }
  touchSession();

  // ── Environment ───────────────────────────────────────────────────────
  function parseUA() {
    var ua = navigator.userAgent || '';
    var browser = 'Other', os = 'Other', device = 'desktop';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\//.test(ua)) browser = 'Opera';
    else if (/SamsungBrowser/.test(ua)) browser = 'Samsung';
    else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
    else if (/CriOS/.test(ua)) browser = 'Chrome iOS';
    else if (/FxiOS/.test(ua)) browser = 'Firefox iOS';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';
    else if (/MSIE|Trident/.test(ua)) browser = 'IE';

    if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    // iPadOS 13+ reports as Mac; detect by touch
    if (os === 'macOS' && navigator.maxTouchPoints > 1) os = 'iPadOS';

    if (/iPad|Tablet|PlayBook|Silk/.test(ua) || os === 'iPadOS' || (/Android/.test(ua) && !/Mobile/.test(ua))) device = 'tablet';
    else if (/Mobi|iPhone|iPod|Android/.test(ua)) device = 'mobile';

    try {
      if (navigator.userAgentData && navigator.userAgentData.brands) {
        var b = navigator.userAgentData.brands.map(function (x) { return x.brand; }).join(' ');
        if (/Edge/.test(b)) browser = 'Edge';
        else if (/Opera/.test(b)) browser = 'Opera';
        else if (/Brave/.test(b)) browser = 'Brave';
        else if (/Chrome/.test(b)) browser = 'Chrome';
        if (navigator.userAgentData.mobile) device = 'mobile';
      }
    } catch (e) {}
    return { browser: browser, os: os, device: device };
  }
  var ENV = parseUA();
  var tz = null;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
  var screenStr = (screen && screen.width) ? screen.width + 'x' + screen.height : null;
  function viewportStr() { return window.innerWidth + 'x' + window.innerHeight; }

  function utm() {
    var p = new URLSearchParams(location.search);
    return {
      source: p.get('utm_source') || p.get('ref') || null,
      medium: p.get('utm_medium') || null,
      campaign: p.get('utm_campaign') || null
    };
  }
  var UTM = utm();
  // Persist first-touch UTM across the session
  if (UTM.source) ss(false, 'gv.utm', JSON.stringify(UTM));
  else { try { UTM = JSON.parse(ss(true, 'gv.utm') || 'null') || UTM; } catch (e) {} }

  function referrerHost() {
    var r = document.referrer || '';
    if (!r) return null;
    try { var u = new URL(r); return u.host === location.host ? null : u.host; } catch (e) { return null; }
  }
  var REFERRER = referrerHost();
  if (REFERRER) ss(false, 'gv.ref', REFERRER); else REFERRER = ss(true, 'gv.ref') || null;

  // ── Signed-in user id (mirrors supabase-js session in localStorage) ───
  var userCache = { at: 0, id: null };
  function currentUserId() {
    var t = Date.now();
    if (t - userCache.at < 15000) return userCache.id;
    userCache.at = t;
    try {
      var raw = ls(true, AUTH_LS_KEY);
      var obj = raw ? JSON.parse(raw) : null;
      userCache.id = obj && obj.user && obj.user.id ? obj.user.id : null;
    } catch (e) { userCache.id = null; }
    return userCache.id;
  }

  // ── Queue + transport ─────────────────────────────────────────────────
  var queue = [];
  var flushTimer = null;
  var sentThisSession = parseInt(ss(true, 'gv.sid_n') || '0', 10);
  var lastPath = null;

  function currentPath() { return location.pathname; }

  function track(event, fields) {
    if (sentThisSession >= MAX_EVENTS_PER_SESSION) return;
    sentThisSession++;
    ss(false, 'gv.sid_n', String(sentThisSession));
    touchSession();
    var row = {
      event: String(event).slice(0, 40),
      visitor_id: visitorId,
      session_id: sessionId,
      user_id: currentUserId(),
      path: currentPath().slice(0, 200),
      referrer: REFERRER,
      browser: ENV.browser,
      os: ENV.os,
      device: ENV.device,
      screen: screenStr,
      viewport: viewportStr(),
      lang: (navigator.language || '').slice(0, 16) || null,
      tz: tz,
      utm_source: UTM.source, utm_medium: UTM.medium, utm_campaign: UTM.campaign,
      is_new: isNewVisitor,
      client_ts: new Date().toISOString(),
      // PostgREST bulk insert requires identical keys on every row, so always send all of them.
      game_id: null, item_id: null, item_title: null, value: null, meta: null
    };
    fields = fields || {};
    if (fields.game_id) row.game_id = String(fields.game_id).slice(0, 80);
    if (fields.item_id != null) row.item_id = String(fields.item_id).slice(0, 80);
    if (fields.item_title) row.item_title = String(fields.item_title).slice(0, 200);
    if (typeof fields.value === 'number' && isFinite(fields.value)) row.value = fields.value;
    if (fields.meta) row.meta = fields.meta;
    queue.push(row);
    scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(function () { flushTimer = null; flush(false); }, FLUSH_MS);
  }

  function flush(unloading) {
    if (!queue.length) return;
    var batch = queue.splice(0, queue.length);
    var body = JSON.stringify(batch);
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + SUPA_KEY,
          'Prefer': 'return=minimal'
        },
        body: body
      }).catch(function () {
        if (!unloading && batch.length < 50) { queue = batch.concat(queue); }
      });
    } catch (e) {}
  }

  // ── Page view ─────────────────────────────────────────────────────────
  function perfMeta() {
    var m = {};
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if (nav) {
        m.load_ms = Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd || 0);
        m.ttfb_ms = Math.round(nav.responseStart || 0);
        m.nav_type = nav.type;
      }
    } catch (e) {}
    try {
      var c = navigator.connection;
      if (c) { m.conn = c.effectiveType || null; if (c.downlink) m.downlink = c.downlink; if (c.saveData) m.save_data = true; }
    } catch (e) {}
    if (navigator.deviceMemory) m.mem_gb = navigator.deviceMemory;
    if (navigator.hardwareConcurrency) m.cpu = navigator.hardwareConcurrency;
    m.dpr = window.devicePixelRatio || 1;
    m.touch = navigator.maxTouchPoints > 0;
    try { m.dark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) {}
    m.visits = visitCount;
    m.new_session = isNewSession;
    m.landing = location.pathname + location.search;
    m.full_referrer = (document.referrer || '').slice(0, 300) || null;
    m.first_seen = ls(true, 'gv.first_seen') || null;
    m.cloaked = !!ls(true, 'gv.cloak.v1');
    return m;
  }

  function sendPageview() {
    lastPath = currentPath();
    track('pageview', { meta: perfMeta() });
  }
  if (document.readyState === 'complete') sendPageview();
  else window.addEventListener('load', function () { setTimeout(sendPageview, 0); });

  // Virtual navigation (SPA routes: /games, /games/:id, /movies, /tv, /movie/:id, /tv/:id)
  var origPush = history.pushState;
  history.pushState = function () {
    var r = origPush.apply(this, arguments);
    onRouteChange();
    return r;
  };
  window.addEventListener('popstate', function () { setTimeout(onRouteChange, 0); });
  function onRouteChange() {
    var p = currentPath();
    if (p === lastPath) return;
    lastPath = p;
    track('nav', { meta: { from: lastNavFrom } });
    lastNavFrom = p;
  }
  var lastNavFrom = currentPath();

  // ── Games ─────────────────────────────────────────────────────────────
  function allGames() { try { return (typeof GAMES !== 'undefined' && GAMES) ? GAMES : []; } catch (e) { return []; } }
  var game = { id: null, name: null, cat: null, openedAt: 0, source: 'browse', loaded: false };
  var rollShowing = false;
  var initialPath = location.pathname;

  function gameSource() {
    if (rollShowing) return 'roll';
    if (initialPath.indexOf('/games/') === 0 && Date.now() - performance.timeOrigin < 5000) return 'direct_link';
    var s = document.getElementById('search');
    if (s && s.value.trim()) return 'search';
    return 'browse';
  }

  var lastOpenKey = '';
  function onGameOpen(g) {
    if (!g) return;
    var key = g.id + ':' + Math.floor(Date.now() / 500);
    if (key === lastOpenKey) return; // same game opened twice within 500ms = duplicate hook call
    lastOpenKey = key;
    if (game.id) endGame('switch');
    game = { id: g.id, name: g.name, cat: g.cat, openedAt: Date.now(), source: gameSource(), loaded: false };
    var s = document.getElementById('search');
    var meta = { name: g.name, cat: g.cat, source: game.source };
    if (s && s.value.trim()) meta.q = s.value.trim().slice(0, 80);
    var active = document.querySelector('#catBar .cat-pill.active');
    if (active) meta.category = active.childNodes[0] ? active.childNodes[0].textContent.trim() : null;
    track('game_open', { game_id: g.id, item_title: g.name, meta: meta });
  }

  function endGame(reason) {
    if (!game.id) return;
    var secs = Math.round((Date.now() - game.openedAt) / 1000);
    track('game_close', { game_id: game.id, item_title: game.name, value: secs, meta: { cat: game.cat, reason: reason, loaded: game.loaded } });
    game = { id: null, name: null, cat: null, openedAt: 0, source: 'browse', loaded: false };
  }

  function hookGames() {
    // Wrap the global openGame so every caller (cards, roll, deep-link) is seen.
    var wrapped = null;
    function wrap() {
      var cur = window.openGame;
      if (typeof cur !== 'function' || cur === wrapped) return;
      var inner = cur;
      wrapped = function (g) { var r = inner.apply(this, arguments); try { onGameOpen(g); } catch (e) {} return r; };
      window.openGame = wrapped;
    }
    // Runs from DOMContentLoaded, after the auth module has installed its own wrapper.
    wrap();

    var overlay = document.getElementById('gameOverlay');
    if (overlay) {
      new MutationObserver(function () {
        if (!overlay.classList.contains('show') && game.id) endGame('close');
      }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }
    var frame = document.getElementById('gameFrame');
    if (frame) {
      frame.addEventListener('load', function () {
        if (!game.id || !frame.getAttribute('src') || game.loaded) return;
        game.loaded = true;
        track('game_load', { game_id: game.id, item_title: game.name, value: Date.now() - game.openedAt });
      });
    }
    var fs = document.getElementById('gameFullscreen');
    if (fs) fs.addEventListener('click', function () { if (game.id) track('game_fullscreen', { game_id: game.id, item_title: game.name }); });
    var nt = document.getElementById('gameNewTab');
    if (nt) nt.addEventListener('click', function () { if (game.id) track('game_newtab', { game_id: game.id, item_title: game.name }); });

    var roll = document.getElementById('rollOverlay');
    if (roll) {
      new MutationObserver(function () {
        var showing = roll.classList.contains('show');
        if (showing && !rollShowing) track('roll');
        rollShowing = showing;
        if (!showing) setTimeout(function () { rollShowing = false; }, 300);
      }).observe(roll, { attributes: true, attributeFilter: ['class'] });
    }
    var rollPlay = document.getElementById('rollPlay');
    if (rollPlay) rollPlay.addEventListener('click', function () { rollShowing = true; setTimeout(function () { rollShowing = false; }, 500); });

    // Stars (delegated; button aria-label is "Star <name>" / "Unstar <name>")
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.tile-star') : null;
      if (!btn) return;
      var label = btn.getAttribute('aria-label') || '';
      var starring = /^Star /.test(label);
      var name = label.replace(/^(Un)?[Ss]tar /, '');
      var g = allGames().find(function (x) { return x.name === name; });
      track('star', { game_id: g ? g.id : null, item_title: name, value: starring ? 1 : 0 });
    }, true);
  }

  // ── Search + filters ──────────────────────────────────────────────────
  function hookSearch() {
    var input = document.getElementById('search');
    var t = null;
    if (input) {
      input.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          var q = input.value.trim();
          if (!q) return;
          var ql = q.toLowerCase();
          var results = allGames().filter(function (g) {
            return g.name.toLowerCase().indexOf(ql) !== -1 || g.id.toLowerCase().indexOf(ql) !== -1;
          }).length;
          track('search', { item_title: q.slice(0, 80), value: results, meta: { section: 'games' } });
        }, 900);
      });
    }
    var ms = document.getElementById('moviesSearch');
    var t2 = null;
    if (ms) {
      ms.addEventListener('input', function () {
        clearTimeout(t2);
        t2 = setTimeout(function () {
          var q = ms.value.trim();
          if (!q) return;
          var section = (location.pathname.indexOf('/tv') === 0) ? 'tv' : 'movies';
          track('search', { item_title: q.slice(0, 80), meta: { section: section } });
        }, 900);
      });
    }
    var catBar = document.getElementById('catBar');
    if (catBar) catBar.addEventListener('click', function (e) {
      var pill = e.target.closest && e.target.closest('.cat-pill');
      if (!pill) return;
      var name = pill.childNodes[0] ? pill.childNodes[0].textContent.trim() : pill.textContent.trim();
      track('category', { item_title: name });
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.movies-cat-btn');
      if (!b) return;
      var section = b.closest('#tvCatBar') ? 'tv' : 'movies';
      track('genre', { item_title: b.textContent.trim(), item_id: b.dataset.genre || 'all', meta: { section: section } });
    });
    var sortMenu = document.getElementById('sortMenu');
    if (sortMenu) sortMenu.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-sort]');
      if (b) track('sort', { item_title: b.dataset.sort });
    });
  }

  // ── Movies / TV ───────────────────────────────────────────────────────
  var media = { key: null, title: null, kind: null, startedAt: 0 };
  function endMedia(reason) {
    if (!media.key) return;
    var secs = Math.round((Date.now() - media.startedAt) / 1000);
    track(media.kind + '_close', { item_id: media.key.split(':')[1], item_title: media.title, value: secs, meta: { reason: reason } });
    media = { key: null, title: null, kind: null, startedAt: 0 };
  }
  function hookMedia() {
    var frameWrap = document.getElementById('moviePlayerFrame');
    var title = document.getElementById('moviePlayerTitle');
    if (!frameWrap) return;
    var lastSrc = null;
    new MutationObserver(function () {
      var ifr = frameWrap.querySelector('iframe');
      var src = ifr ? ifr.getAttribute('src') : null;
      if (src === lastSrc) return;
      lastSrc = src;
      if (!src) { endMedia('close'); return; }
      var mm = src.match(/\/movie\/(\d+)/);
      var tv = src.match(/\/tv\/(\d+)\/(\d+)\/(\d+)/);
      var t = title ? title.textContent.trim() : '';
      if (mm) {
        endMedia('switch');
        media = { key: 'movie:' + mm[1], title: t, kind: 'movie', startedAt: Date.now() };
        track('movie_play', { item_id: mm[1], item_title: t });
      } else if (tv) {
        var key = 'tv:' + tv[1];
        if (media.key !== key) { endMedia('switch'); media = { key: key, title: t, kind: 'tv', startedAt: Date.now() }; }
        track('tv_play', { item_id: tv[1], item_title: t, meta: { season: +tv[2], episode: +tv[3] } });
      }
    }).observe(frameWrap, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  }

  // ── Misc UI ───────────────────────────────────────────────────────────
  function hookUI() {
    function on(id, ev) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function () { track(ev); });
    }
    on('enterBtn', 'enter');
    on('newsBtn', 'news_open');
    on('moviesBtn', 'movies_enter');
    on('userBtnWelcome', 'profile_open');
    on('userBtnHeader', 'profile_open');
    on('modeMovies', 'mode_movies');
    on('modeTV', 'mode_tv');
    document.addEventListener('click', function (e) {
      var p = e.target.closest && e.target.closest('.cloak-preset');
      if (p) track('cloak', { item_title: p.dataset.id || 'preset' });
    });
    var cc = document.getElementById('cloakApplyCustom');
    if (cc) cc.addEventListener('click', function () { track('cloak', { item_title: 'custom' }); });

    // Sign-in detection: user id appears after page load
    var seenUser = currentUserId();
    setInterval(function () {
      userCache.at = 0;
      var u = currentUserId();
      if (u && u !== seenUser) track('auth_signin');
      seenUser = u;
    }, 20000);
  }

  // ── Errors ────────────────────────────────────────────────────────────
  var errCount = 0;
  window.addEventListener('error', function (e) {
    if (errCount++ > 10) return;
    var msg = (e && e.message) ? e.message : 'error';
    track('error', { item_title: String(msg).slice(0, 200), meta: { src: e && e.filename ? String(e.filename).slice(-120) : null, line: e && e.lineno, game: game.id } });
  });
  window.addEventListener('unhandledrejection', function (e) {
    if (errCount++ > 10) return;
    var r = e && e.reason;
    var msg = r && r.message ? r.message : String(r || 'rejection');
    track('error', { item_title: String(msg).slice(0, 200), meta: { kind: 'promise', game: game.id } });
  });

  // ── Heartbeat / session end ───────────────────────────────────────────
  function sessionSecs() { return Math.round((Date.now() - sessionStart) / 1000); }
  var hb = null;
  function startHB() {
    if (hb) return;
    hb = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      track('ping', { value: sessionSecs(), game_id: game.id || undefined, meta: game.id ? { playing: game.id } : (media.key ? { watching: media.key } : undefined) });
    }, HEARTBEAT_MS);
  }
  startHB();

  var ended = false;
  function endSession(reason) {
    if (ended) return;
    ended = true;
    if (game.id) endGame('unload');
    if (media.key) endMedia('unload');
    track('session_end', { value: sessionSecs(), meta: { events: sentThisSession, reason: reason } });
    flush(true);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      track('hidden', { value: sessionSecs(), game_id: game.id || undefined });
      flush(true);
    } else {
      ended = false;
      track('visible', { value: sessionSecs() });
    }
  });
  window.addEventListener('pagehide', function () { endSession('pagehide'); });
  window.addEventListener('beforeunload', function () { endSession('unload'); });

  // ── Boot ──────────────────────────────────────────────────────────────
  function boot() {
    try { hookGames(); } catch (e) {}
    try { hookSearch(); } catch (e) {}
    try { hookMedia(); } catch (e) {}
    try { hookUI(); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.GVA = { track: track, visitorId: visitorId, sessionId: sessionId, flush: flush };
})();

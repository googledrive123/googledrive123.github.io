/*
 * GameVault backup addresses
 * --------------------------
 * The site also runs at other github.io addresses: forks that copy every
 * change from this one once a day (.github/workflows/sync.yml). Schools block
 * sites one address at a time, so when one is blocked another usually still
 * works. The owner lists them from the dashboard (gv_mirrors, sql/mirrors.sql).
 *
 * Progress does not follow on its own. localStorage and IndexedDB belong to
 * one address, so a new one starts empty. moveSaves() carries this browser's
 * progress to a tab it opens at the other address, over postMessage, the one
 * way two addresses can hand each other data inside a browser.
 *
 * Public surface: window.GV.mirrors. Moving saves needs /js/saves.js too.
 */
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  var MAIN = 'https://googledrive123.github.io';
  var CACHE_KEY = 'gv.mirrors.list';
  var CHECK_MS = 5000;

  function rpc(name, args) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      if (!r.ok) throw new Error(name + ' ' + r.status);
      return r.json();
    });
  }

  function remember(rows) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch (e) {}
  }

  function remembered() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
  }

  function withMain(rows, stale) {
    var items = [{ origin: MAIN, label: 'Main address', main: true }];
    (rows || []).forEach(function (r) {
      if (r && r.origin && r.origin !== MAIN) items.push({ origin: r.origin, label: r.label || '', main: false });
    });
    items.stale = stale;
    return items;
  }

  /* The main address first, then every one the owner added: [{origin, label,
     main}]. The database can be blocked too, so when it cannot be reached the
     last list this browser saw stands in, with stale set on the array. */
  var listing = null;
  function list() {
    if (!listing) {
      listing = rpc('gv_mirrors_list').then(function (rows) {
        remember(rows);
        return withMain(rows, false);
      }, function (err) {
        listing = null;
        var old = remembered();
        if (!old) throw err;
        return withMain(old, true);
      });
    }
    return listing;
  }

  /* An address's icon, loaded as a plain image: that needs no permission from
     the other address, and a school filter answers it with a block page or
     nothing at all, neither of which is an image. 'up' when it loads,
     'blocked' when it fails, 'unknown' when nothing comes back in time. */
  function check(origin) {
    return new Promise(function (resolve) {
      var img = new Image();
      var timer = setTimeout(function () { finish('unknown'); }, CHECK_MS);
      function finish(state) {
        clearTimeout(timer);
        img.onload = img.onerror = null;
        img.removeAttribute('src');
        resolve(state);
      }
      img.onload = function () { finish('up'); };
      img.onerror = function () { finish('blocked'); };
      img.src = String(origin).replace(/\/+$/, '') + '/favicon.svg?' + Date.now();
    });
  }

  function escapeRe(text) {
    return text.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  }

  function parts(origin) {
    var m = /^([a-z][a-z0-9+.-]*):\/\/([^:\/]+)(?::(\d+))?$/i.exec(String(origin || ''));
    return m && { scheme: m[1], host: m[2], port: m[3] || '' };
  }

  // A colon or slash as written plainly, URL-encoded (once or more), or, for
  // a slash, escaped with backslashes by one or more rounds of JSON.
  var COLON = '(:|%(?:25)*3a)';
  var SLASH = '(\\\\*/|%(?:25)*2f)';

  /* Progress sometimes holds full addresses: a link back to a game, a frame
     source, a JSON blob inside a localStorage string, often JSON inside JSON.
     Each one that points at the old address is pointed at the new one, in
     every string at any depth, keys included, keeping however it was
     escaped or encoded. Bytes are left alone: a binary save can hold lengths
     that a longer or shorter address would break. */
  function rewrite(value, from, to) {
    var a = parts(from);
    var b = parts(to);
    if (!a || !b || from === to) return value;
    // The old address has to end where the match does, so localhost:8000
    // leaves localhost:80001 and a longer host name alone.
    var re = new RegExp(escapeRe(a.scheme) + COLON + SLASH + SLASH + escapeRe(a.host)
      + (a.port ? COLON + a.port : '') + '(?![\\w.-])', 'gi');

    function swap(text) {
      return text.replace(re, function (m, colon, slash1, slash2, portColon) {
        // With no port in the old address there is no fifth group, and that
        // argument is the match's offset instead.
        if (!a.port) portColon = colon;
        var out = b.scheme + colon + slash1 + slash2 + b.host;
        return b.port ? out + portColon + b.port : out;
      });
    }

    function walk(v) {
      if (typeof v === 'string') return swap(v);
      if (Array.isArray(v)) return v.map(walk);
      if (v === null || typeof v !== 'object') return v;
      if (v.$gv === 'bytes' || v.$gv === 'blob') return v;
      var out = {};
      Object.keys(v).forEach(function (key) { out[swap(key)] = walk(v[key]); });
      return out;
    }

    return walk(value);
  }

  window.GV = window.GV || {};
  window.GV.mirrors = {
    MAIN: MAIN,
    list: list,
    check: check,
    rewrite: rewrite
  };
})();

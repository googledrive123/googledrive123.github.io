// Keeps a signed-in player's PolyTrack save on their GameVault account.
//
// The game saves everything in this browser's localStorage: the profile with
// the car's colours and parts, the best time and replay on every track, the
// tracks made in the editor, the unlocked car parts, controls and settings.
// None of it followed the account, so a new computer or a new browser meant
// starting over however many times the player signed in.
//
// This keeps those keys on the account as well (save.sql) and puts them back
// before the game starts. The game reads its profiles once, as it starts, so
// the bundle has to wait for that: index.html no longer loads main.bundle.js
// itself, this file does.
//
// Must stay before main.bundle.js, like leaderboard.js. The bundle is still
// exactly what Kodub shipped.
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  var AUTH_KEY = 'sb-dxwjxzmlezfyursysays-auth-token';

  // Everything that is the player's rather than the machine's. Must match
  // polytrack_save_push in save.sql, which refuses any other key.
  var SYNCED = new RegExp('^(polytrack_v5_prod_(user_slot|user_\\d{1,3}'
    + '|record_\\d{1,3}_(default|undeterministic)_[0-9a-f]{64}'
    + '|track_[\\s\\S]{1,200}|unlocked_car_styles|key_bindings|settings'
    + '|is_music_enabled|startup_info)|gv\\.anon)$');

  var SETTINGS_KEY = 'polytrack_v5_prod_settings';
  var STARTUP_KEY = 'polytrack_v5_prod_startup_info';

  // Settings that are about the machine and not the player. A school
  // Chromebook should not pick up the Ultra shadows set on a gaming PC.
  // graphics.js sets these same ones.
  var GRAPHICS = [
    'ShadowQuality', 'CloudsEnabled', 'ParticlesEnabled', 'SkidmarksEnabled',
    'FogEnabled', 'RenderScale', 'ScreenPixelDensity', 'Antialiasing'
  ];

  // Which account this browser's save belongs to, when it last pulled, and
  // which keys it has changed since that the account does not have yet.
  var LINKED_KEY = 'gv.ptsave.user';
  var SINCE_KEY = 'gv.ptsave.at';
  var DIRTY_KEY = 'gv.ptsave.dirty';

  // What index.html used to load with defer, in the same order.
  var SCRIPTS = ['main.bundle.js', 'account.js', 'rooms_ui.js', 'creator.js'];

  // How long the game is held back for the save. Past that it starts on what
  // this browser has, and the account's copy waits for the next launch.
  var WAIT_MS = 8000;
  var TOKEN_WAIT_MS = 4000;

  var ls = null;
  try { ls = window.localStorage; } catch (e) {}

  var started = false;
  var late = false;

  function whenParsed(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  // Deferred scripts used to run once the page was parsed, and the game
  // looks for its canvas as soon as it runs, so this waits for the same.
  function loadGame() {
    if (started) return;
    started = true;
    late = true;
    whenParsed(function () {
      SCRIPTS.forEach(function (src) {
        var script = document.createElement('script');
        script.src = src;
        script.async = false;
        document.head.appendChild(script);
      });
    });
  }

  if (!ls) {
    loadGame();
    return;
  }

  // ── Storage ───────────────────────────────────────────────────────────

  var proto = Storage.prototype;
  var nativeSet = proto.setItem;
  var nativeRemove = proto.removeItem;

  function read(key) {
    try { return ls.getItem(key); } catch (e) { return null; }
  }

  // Straight past the watch below: what this file writes is the account's
  // copy arriving, not a change to send back to it.
  function write(key, value) {
    try {
      if (value == null) nativeRemove.call(ls, key);
      else nativeSet.call(ls, key, value);
    } catch (e) { console.error('[save]', e); }
  }

  function syncedKeys() {
    var out = [];
    try {
      for (var i = 0; i < ls.length; i++) {
        var key = ls.key(i);
        if (key && SYNCED.test(key)) out.push(key);
      }
    } catch (e) {}
    return out;
  }

  function parse(raw) {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function isGraphics(pair) {
    return Array.isArray(pair) && GRAPHICS.indexOf(pair[0]) >= 0;
  }

  // A key's value as the account holds it. Settings go up without the
  // graphics ones, and settings with nothing else left in them are none.
  function outgoing(key, value) {
    if (key !== SETTINGS_KEY || value == null) return value;
    var list = parse(value);
    if (!Array.isArray(list)) return value;
    var kept = list.filter(function (pair) { return !isGraphics(pair); });
    return kept.length ? JSON.stringify(kept) : null;
  }

  // A value from the account as it goes into this browser. This machine's
  // graphics settings stay what they were.
  function incoming(key, value) {
    if (key !== SETTINGS_KEY) return value;
    var here = parse(read(key));
    var graphics = Array.isArray(here) ? here.filter(isGraphics) : [];
    var list = value == null ? [] : parse(value);
    if (!Array.isArray(list)) return read(key);
    var all = list.filter(function (pair) { return !isGraphics(pair); }).concat(graphics);
    return all.length ? JSON.stringify(all) : null;
  }

  // ── Changes made here ─────────────────────────────────────────────────
  // The game writes through localStorage.setItem, so that is where its
  // changes are heard. They are remembered across reloads until the account
  // has them: a lap finished just before the tab closed still gets there.

  var dirty = {};
  var remembered = parse(read(DIRTY_KEY));
  (Array.isArray(remembered) ? remembered : []).forEach(function (key) {
    if (typeof key === 'string' && SYNCED.test(key)) dirty[key] = true;
  });

  function saveDirty() {
    var keys = Object.keys(dirty);
    write(DIRTY_KEY, keys.length ? JSON.stringify(keys) : null);
  }

  // The game saves the same profile over itself often. Only a write that
  // leaves the account's view of the key different counts.
  function watched(storage, key) {
    return storage === ls && SYNCED.test(String(key));
  }

  proto.setItem = function (key, value) {
    var watch = watched(this, key);
    var before = watch ? outgoing(String(key), read(String(key))) : null;
    nativeSet.apply(this, arguments);
    if (watch && outgoing(String(key), read(String(key))) !== before) changed(String(key));
  };

  proto.removeItem = function (key) {
    var watch = watched(this, key);
    var before = watch ? outgoing(String(key), read(String(key))) : null;
    nativeRemove.apply(this, arguments);
    if (watch && before != null) changed(String(key));
  };

  function changed(key) {
    dirty[key] = true;
    saveDirty();
  }

  // ── Account ───────────────────────────────────────────────────────────

  function session() {
    return parse(read(AUTH_KEY));
  }

  function userOf(s) {
    return (s && s.access_token && s.user && s.user.id) || null;
  }

  function live(s) {
    return !!userOf(s) && (!s.expires_at || s.expires_at * 1000 > Date.now() + 30000);
  }

  // The page around the game refreshes the session every hour. A game opened
  // as the old token runs out waits a moment for the new one rather than
  // being refused with it.
  function liveSession() {
    var s = session();
    if (!userOf(s)) return Promise.resolve(null);
    if (live(s)) return Promise.resolve(s);
    return new Promise(function (resolve) {
      var timer = setTimeout(function () { finish(null); }, TOKEN_WAIT_MS);
      function check(e) {
        if (e.key !== AUTH_KEY) return;
        var next = session();
        if (live(next)) finish(next);
        else if (!userOf(next)) finish(null);
      }
      function finish(value) {
        clearTimeout(timer);
        window.removeEventListener('storage', check);
        resolve(value);
      }
      window.addEventListener('storage', check);
    });
  }

  // ── Start ─────────────────────────────────────────────────────────────

  loadGame();
})();

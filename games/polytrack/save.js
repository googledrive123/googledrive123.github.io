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
  // save.sql forgets removals after 90 days, so a browser away longer than
  // this takes the whole save again instead of asking what changed.
  var FULL_AFTER_MS = 80 * 24 * 60 * 60 * 1000;

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

  function rpc(name, body, token, keepalive) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      keepalive: !!keepalive,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error(t || res.status); });
      return res.json();
    });
  }

  // ── Putting the two together ──────────────────────────────────────────

  function kindOf(key) {
    var match = /^polytrack_v5_prod_(record|track|unlocked_car_styles|startup_info)/.exec(key);
    return match ? match[1] : null;
  }

  // One key, held on both sides with different values. Some have a right
  // answer whichever side it is on. For the rest, an edit made here that the
  // account has not seen yet wins, and otherwise the account does.
  function resolve(key, local, cloud, preferLocal) {
    if (local === cloud) return local;
    if (local == null || cloud == null) {
      if (preferLocal) return local;
      return cloud != null ? cloud : local;
    }
    var a = parse(local);
    var b = parse(cloud);
    var kind = kindOf(key);
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      // The faster time, wherever it was set.
      if (kind === 'record' && typeof a.frames === 'number' && typeof b.frames === 'number') {
        return a.frames < b.frames ? local : cloud;
      }
      // The copy of a track saved last in the editor.
      if (kind === 'track' && typeof a.saveTime === 'number' && typeof b.saveTime === 'number') {
        return a.saveTime > b.saveTime ? local : cloud;
      }
      // A car part unlocked on either.
      if (kind === 'unlocked_car_styles') {
        var out = {};
        ['patterns', 'rims', 'exhausts'].forEach(function (part) {
          var all = [];
          [].concat(a[part] || [], b[part] || []).forEach(function (item) {
            if (all.indexOf(item) < 0) all.push(item);
          });
          out[part] = all;
        });
        return JSON.stringify(out);
      }
      // The tutorial done on either.
      if (kind === 'startup_info') {
        a.isTutorialCompleted = !!(a.isTutorialCompleted || b.isTutorialCompleted);
        return JSON.stringify(a);
      }
    }
    return preferLocal ? local : cloud;
  }

  function sha256(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (byte) {
        return ('0' + byte.toString(16)).slice(-2);
      }).join('');
    });
  }

  // The game files each best time under a hash of the profile's token, and
  // ignores any time whose hash is not the current profile's. When a profile
  // from here gives way to the account's, the times set with it are refiled
  // under the account's so they still count.
  function refile(result, local, cloud) {
    var jobs = [];
    Object.keys(result).forEach(function (key) {
      var slot = /^polytrack_v5_prod_user_(\d+)$/.exec(key);
      if (!slot || local[key] == null || cloud[key] == null) return;
      var kept = parse(result[key]);
      var lost = parse(result[key] === cloud[key] ? local[key] : cloud[key]);
      if (!kept || !lost || typeof kept.token !== 'string' || typeof lost.token !== 'string'
          || kept.token === lost.token) return;
      jobs.push(Promise.all([sha256(kept.token), sha256(lost.token)]).then(function (hashes) {
        var prefix = 'polytrack_v5_prod_record_' + slot[1] + '_';
        Object.keys(result).forEach(function (other) {
          if (other.indexOf(prefix) !== 0 || result[other] == null) return;
          var record = parse(result[other]);
          if (!record || record.tokenHash !== hashes[1]) return;
          record.tokenHash = hashes[0];
          result[other] = JSON.stringify(record);
        });
      }));
    });
    return Promise.all(jobs).then(function () { return result; });
  }

  // The first time this browser meets the account. Both sides are the
  // player's: the account's from other browsers, this one's from playing
  // here, most likely before signing in. Nothing on either is dropped.
  function link(cloud) {
    var local = {};
    syncedKeys().forEach(function (key) { local[key] = outgoing(key, read(key)); });
    var result = {};
    Object.keys(local).concat(Object.keys(cloud)).forEach(function (key) {
      if (key in result) return;
      result[key] = resolve(key, key in local ? local[key] : null,
        key in cloud ? cloud[key] : null, false);
    });
    return refile(result, local, cloud);
  }

  // A different account from the one this browser's save belongs to, which
  // is someone else on a shared computer. Their save replaces it instead of
  // joining it. Only having done the tutorial carries over.
  function replace(cloud) {
    var result = {};
    syncedKeys().forEach(function (key) { result[key] = null; });
    Object.keys(cloud).forEach(function (key) { result[key] = cloud[key]; });
    result[STARTUP_KEY] = resolve(STARTUP_KEY, read(STARTUP_KEY),
      STARTUP_KEY in cloud ? cloud[STARTUP_KEY] : null, false);
    dirty = {};
    return result;
  }

  // This browser has synced with the account before. What changed on the
  // account since is taken, except where this browser changed the same key
  // and has not sent it yet: then the two are weighed against each other.
  function update(cloud, full) {
    var result = {};
    Object.keys(cloud).forEach(function (key) {
      result[key] = dirty[key]
        ? resolve(key, outgoing(key, read(key)), cloud[key], true)
        : cloud[key];
    });
    // A full pull only lists what is still there, so anything missing from it
    // was removed on the account.
    if (full) {
      syncedKeys().forEach(function (key) {
        if (!(key in cloud) && !dirty[key]) result[key] = null;
      });
    }
    return result;
  }

  // ── Start ─────────────────────────────────────────────────────────────

  loadGame();
})();

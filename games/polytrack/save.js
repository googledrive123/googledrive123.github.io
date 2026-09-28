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

  // Everything that is the player's rather than the machine's. Must match
  // polytrack_save_push in save.sql, which refuses any other key.
  var SYNCED = new RegExp('^(polytrack_v5_prod_(user_slot|user_\\d{1,3}'
    + '|record_\\d{1,3}_(default|undeterministic)_[0-9a-f]{64}'
    + '|track_[\\s\\S]{1,200}|unlocked_car_styles|key_bindings|settings'
    + '|is_music_enabled|startup_info)|gv\\.anon)$');

  // What index.html used to load with defer, in the same order.
  var SCRIPTS = ['main.bundle.js', 'account.js', 'rooms_ui.js', 'creator.js'];

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

  // ── Start ─────────────────────────────────────────────────────────────

  loadGame();
})();

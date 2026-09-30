/*
 * GameVault save backup
 * ---------------------
 * Most games here keep their progress in this site's own storage: the
 * localStorage and IndexedDB of googledrive123.github.io. So one file can
 * carry every one of those games to another browser, or bring them back after
 * the history was cleared.
 *
 * collect() packs all of it into plain JSON and restore() puts a file back.
 * A signed-in player can also keep three named copies and one daily automatic
 * copy on their account: the gv_saves table and the private 'saves' bucket,
 * set up in /saves/saves.sql.
 *
 * Left out on purpose: the sign-in session, the visitor id, the dashboard
 * secret and the tab disguise belong to this browser and not to a game, and
 * PolyTrack already syncs its own save with the account.
 *
 * Public surface: window.GV.saves.
 */
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  var SUPA_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  var AUTH_KEY = 'sb-dxwjxzmlezfyursysays-auth-token';
  var BUCKET = 'saves';
  var MAX_BYTES = 45 * 1024 * 1024;   // the bucket's own limit, see saves.sql
  var DAY = 24 * 60 * 60 * 1000;
  var AUTO_KEY = 'gv.saves.auto';
  var AUTO_AT_KEY = 'gv.saves.autoAt';

  // Engine caches and GameVault's own identity store: big, rebuilt on their
  // own, and nothing a player would miss.
  var SKIP_DBS = ['gamevault', 'UnityCache', 'EM_PRELOAD_CACHE', 'firebaseLocalStorageDb'];

  /* gv.saves.* is this browser's own record of what it backed up and when,
     so a file made somewhere else must not overwrite it either. */
  function skipKey(key) {
    return (key.indexOf('sb-') === 0 && /-auth-token$/.test(key))
      || key === 'gv.analytics.secret'
      || key === 'gv.vid'
      || key === 'gv.anon'
      || key.indexOf('gv.cloak.') === 0
      || key.indexOf('polytrack_v5_prod_') === 0
      || key.indexOf('gv.saves.') === 0;
  }

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
  }

  function toBase64(bytes) {
    var parts = [];
    for (var i = 0; i < bytes.length; i += 0x8000) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
    }
    return btoa(parts.join(''));
  }

  function fromBase64(text) {
    var raw = atob(text);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }
})();

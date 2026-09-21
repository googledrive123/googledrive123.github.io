/*
 * GameVault visitor identity
 * --------------------------
 * One id per browser, and a name to go with it.
 *
 * The id used to live only in localStorage, written by the analytics tracker.
 * That was enough to count visits and not enough to hang a leaderboard row on:
 * a cleared site-data, a page that never ran the tracker, or the tracker's own
 * opt-out all produced a fresh id, and a fresh id reads as a new player. The
 * PolyTrack board ended up showing the same person twice.
 *
 * So the id is now kept in three places at once - localStorage, a cookie and
 * IndexedDB - and read back from whichever of them survived. Any store that
 * comes up empty is refilled from the ones that did not. Nothing here defeats
 * a deliberate full wipe of the site's data; it defeats the partial ones,
 * which is what was actually happening.
 *
 * localStorage is still the first place looked at, so a visitor who already
 * has an id keeps it and keeps the scores attached to it.
 *
 * Public surface: window.GV.identity.
 */
(function () {
  'use strict';

  var LS_KEY = 'gv.vid';        // shared with the analytics tracker
  var COOKIE = 'gv_vid';
  var DB_NAME = 'gamevault';
  var DB_STORE = 'identity';
  var DB_RECORD = 'visitor';
  var COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10;

  function readLocal() {
    try { return localStorage.getItem(LS_KEY) || null; } catch (e) { return null; }
  }

  function writeLocal(id) {
    try { localStorage.setItem(LS_KEY, id); } catch (e) {}
  }

  function readCookie() {
    try {
      var parts = String(document.cookie || '').split(';');
      for (var i = 0; i < parts.length; i++) {
        var pair = parts[i].trim();
        if (pair.indexOf(COOKIE + '=') === 0) {
          return decodeURIComponent(pair.slice(COOKIE.length + 1)) || null;
        }
      }
    } catch (e) {}
    return null;
  }

  function writeCookie(id) {
    try {
      document.cookie = COOKIE + '=' + encodeURIComponent(id)
        + ';path=/;max-age=' + COOKIE_MAX_AGE + ';samesite=lax';
    } catch (e) {}
  }

  /* IndexedDB is the slow store and the only asynchronous one, so nothing
     waits on it to get an id. It is read and repaired in the background and
     callers that care - the leaderboard, which must not file a run under the
     wrong name - wait on ready first. */
  function openDb() {
    return new Promise(function (resolve) {
      var request;
      try { request = indexedDB.open(DB_NAME, 1); } catch (e) { return resolve(null); }
      if (!request) return resolve(null);
      request.onupgradeneeded = function () {
        try { request.result.createObjectStore(DB_STORE); } catch (e) {}
      };
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { resolve(null); };
      request.onblocked = function () { resolve(null); };
    });
  }

  function readDb(db) {
    return new Promise(function (resolve) {
      if (!db) return resolve(null);
      var request;
      try { request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(DB_RECORD); }
      catch (e) { return resolve(null); }
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { resolve(null); };
    });
  }

  function writeDb(db, id) {
    try { db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(id, DB_RECORD); }
    catch (e) {}
  }

  function uuid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var out = '';
    for (var i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
  }

  /* localStorage and the cookie answer straight away, so the id is settled
     before anything on the page asks for it. Whichever of the two is empty is
     filled from the other. */
  var id = readLocal();
  var fromCookie = readCookie();
  if (!id) id = fromCookie;
  if (!id) id = uuid();
  if (readLocal() !== id) writeLocal(id);
  if (fromCookie !== id) writeCookie(id);

  /* IndexedDB catches up afterwards. If it is holding an older id than the one
     just settled on, that older id is the one this browser has been playing
     under, so it wins and the other two stores are corrected to match. */
  var ready = openDb().then(function (db) {
    if (!db) return id;
    return readDb(db).then(function (stored) {
      if (stored && stored !== id) {
        id = stored;
        writeLocal(id);
        writeCookie(id);
      } else if (!stored) {
        writeDb(db, id);
      }
      return id;
    });
  }).catch(function () { return id; });

  /* ── Guest names ──────────────────────────────────────────────────────
     A visitor who has not signed in still needs something to be called, and
     "Anonymous" is not a name - it is the same non-name everybody else on the
     board is wearing. Three words picked out of the id give a guest something
     to recognise. The same id always produces the same name, so nothing has
     to be stored and the name survives everything the id survives. */

  var ADJECTIVES = [
    'Swift', 'Brave', 'Calm', 'Bold', 'Clever', 'Quiet', 'Rapid', 'Sharp',
    'Silent', 'Sly', 'Steady', 'Bright', 'Lucky', 'Mighty', 'Nimble', 'Quick',
    'Wild', 'Wise', 'Eager', 'Fierce', 'Gentle', 'Humble', 'Jolly', 'Keen',
    'Lively', 'Merry', 'Noble', 'Proud', 'Royal', 'Sunny', 'Tidy', 'Vivid',
    'Witty', 'Zesty', 'Frosty', 'Sturdy', 'Breezy', 'Cosmic', 'Dapper', 'Feisty',
    'Glossy', 'Hidden', 'Jagged', 'Loyal', 'Modest', 'Restless', 'Solar', 'Stormy'
  ];

  var COLOURS = [
    'Amber', 'Azure', 'Bronze', 'Cobalt', 'Coral', 'Crimson', 'Emerald', 'Golden',
    'Indigo', 'Ivory', 'Jade', 'Lilac', 'Maroon', 'Mint', 'Navy', 'Ochre',
    'Olive', 'Onyx', 'Opal', 'Pearl', 'Plum', 'Rose', 'Ruby', 'Saffron',
    'Sage', 'Scarlet', 'Silver', 'Slate', 'Teal', 'Topaz', 'Violet', 'Wheat'
  ];

  var CREATURES = [
    'Fox', 'Falcon', 'Otter', 'Badger', 'Heron', 'Ibis', 'Jackal', 'Kestrel',
    'Lynx', 'Marten', 'Newt', 'Osprey', 'Panther', 'Quail', 'Raven', 'Stoat',
    'Tapir', 'Urchin', 'Viper', 'Walrus', 'Yak', 'Zebra', 'Bison', 'Crane',
    'Dingo', 'Eagle', 'Ferret', 'Gecko', 'Hawk', 'Impala', 'Jaguar', 'Koala',
    'Lemur', 'Mantis', 'Narwhal', 'Ocelot', 'Puffin', 'Rhino', 'Seal', 'Tiger',
    'Vulture', 'Wolf', 'Wombat', 'Weasel', 'Shark', 'Moose', 'Cobra', 'Condor'
  ];

  /* FNV-1a for the id, then a murmur3 finaliser per word. Re-running FNV with
     a different starting value is not enough on its own: the two runs come out
     a fixed distance apart, so the three words move together and most of the
     name space is never reached. Mixing one hash three ways does reach it.
     48 x 32 x 48 is a little over 73,000 names. */
  function hash(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function mix(h) {
    h = (h ^ (h >>> 16)) >>> 0;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function guestName(source) {
    var h = hash(String(source || id || ''));
    return ADJECTIVES[mix((h ^ 0x9e3779b9) >>> 0) % ADJECTIVES.length]
      + COLOURS[mix((h ^ 0x85ebca6b) >>> 0) % COLOURS.length]
      + CREATURES[mix((h ^ 0xc2b2ae35) >>> 0) % CREATURES.length];
  }

  /* ── Stored preferences ───────────────────────────────────────────────
     A chosen name overrides the generated one. Anonymous mode is off unless
     it was deliberately turned on, so a first-time player is somebody rather
     than nobody. */

  var NAME_KEY = 'gv.name';
  var ANON_KEY = 'gv.anon';

  var watchers = [];

  function announce() {
    for (var i = 0; i < watchers.length; i++) {
      try { watchers[i](); } catch (e) {}
    }
  }

  function chosenName() {
    try { return localStorage.getItem(NAME_KEY) || null; } catch (e) { return null; }
  }

  function setChosenName(name) {
    var clean = String(name == null ? '' : name).trim().slice(0, 32);
    try {
      if (clean) localStorage.setItem(NAME_KEY, clean);
      else localStorage.removeItem(NAME_KEY);
    } catch (e) {}
    announce();
  }

  function anonymous() {
    try { return localStorage.getItem(ANON_KEY) === '1'; } catch (e) { return false; }
  }

  function setAnonymous(on) {
    try { localStorage.setItem(ANON_KEY, on ? '1' : '0'); } catch (e) {}
    announce();
  }

  /* The signed-in username is looked up by whichever page has a Supabase
     client to hand and left here, so the rest of the site can read it without
     waiting on a round trip of its own. Cleared on sign-out. */

  var ACCOUNT_KEY = 'gv.username';

  function accountName() {
    try { return localStorage.getItem(ACCOUNT_KEY) || null; } catch (e) { return null; }
  }

  function setAccountName(name) {
    var clean = String(name == null ? '' : name).trim().slice(0, 32);
    try {
      if (clean) localStorage.setItem(ACCOUNT_KEY, clean);
      else localStorage.removeItem(ACCOUNT_KEY);
    } catch (e) {}
    announce();
  }

  /* The name behind the player, whether or not anyone else gets to see it.
     An account username wins: it is the name the site already knows them by,
     and there is no sense in the same person answering to two things. */
  function realName() {
    return accountName() || chosenName() || guestName(id);
  }

  /* The name everybody else sees. */
  function publicName() {
    return anonymous() ? 'Anonymous' : realName();
  }

  window.GV = window.GV || {};
  window.GV.identity = {
    ready: ready,
    id: function () { return id; },
    guestName: guestName,
    chosenName: chosenName,
    setChosenName: setChosenName,
    accountName: accountName,
    setAccountName: setAccountName,
    anonymous: anonymous,
    setAnonymous: setAnonymous,
    realName: realName,
    publicName: publicName,
    onChange: function (fn) { if (typeof fn === 'function') watchers.push(fn); }
  };
})();

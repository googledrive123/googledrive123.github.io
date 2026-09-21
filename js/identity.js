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

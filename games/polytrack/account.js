// The GameVault account strip and settings page inside PolyTrack.
//
// The game has no idea the site around it has accounts, and its own menu has
// nowhere to say who is playing. Without that, a board full of "Anonymous" is
// the only answer a player ever gets to "which one of these is me".
//
// Like leaderboard.js, this stays outside main.bundle.js: it waits for the
// game to build its menu and then adds to it, so the bundle is still exactly
// what Kodub shipped and a newer PolyTrack drops straight in.
//
// Reads and writes js/identity.js. Everything it shows comes from there.
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  var AUTH_KEY = 'sb-dxwjxzmlezfyursysays-auth-token';

  function identity() {
    return (window.GV && window.GV.identity) || null;
  }

  function session() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function signedIn() {
    var s = session();
    return !!(s && s.access_token);
  }

  // The site writes the username into the identity module as it signs in, so
  // most of the time it is already here. It is fetched only when the game was
  // opened straight from its own URL and that never happened.
  function loadAccountName() {
    var gv = identity();
    var s = session();
    if (!gv || !s || !s.access_token || !s.user || !s.user.id) return;
    if (gv.accountName()) return;
    fetch(SUPA_URL + '/rest/v1/profiles?select=username&id=eq.' + encodeURIComponent(s.user.id), {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + s.access_token }
    }).then(function (res) {
      return res.ok ? res.json() : null;
    }).then(function (rows) {
      if (rows && rows[0] && rows[0].username) gv.setAccountName(rows[0].username);
    }).catch(function () {});
  }

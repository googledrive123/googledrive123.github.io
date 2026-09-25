// The site owner's way into a PolyTrack game.
//
// The analytics dashboard lists who is playing right now, and from there the
// owner can join any of them: straight into the room they are in, or, for
// someone racing alone, into a room their game opens for the purpose. Every
// game in the room is then told the creator is there.
//
// This file is the game's half of that. It tells the site where this player
// is every few seconds, opens a room when the dashboard asks for one, walks
// the owner's own game into a room when it is opened from the dashboard, and
// shows the notice when the owner arrives.
//
// Like the rest of the mod it stays outside main.bundle.js and drives the
// game through its own screens, the way a player would.
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  var AUTH_KEY = 'sb-dxwjxzmlezfyursysays-auth-token';

  function identity() {
    return (window.GV && window.GV.identity) || null;
  }

  function rooms() {
    return (window.GV && window.GV.rooms) || null;
  }

  function accessToken() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return (parsed && parsed.access_token) || null;
    } catch (e) { return null; }
  }

  // Signed in where possible, so the dashboard can put the account's name to
  // the player. A token past its expiry is refused outright and refreshing it
  // is the site's job, so the call is retried without it rather than lost.
  function rpc(name, body) {
    var token = accessToken();
    function send(bearer) {
      return fetch(SUPA_URL + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + (bearer || SUPA_KEY)
        },
        body: JSON.stringify(body)
      });
    }
    return send(token).then(function (res) {
      return res.ok || !token ? res : send(null);
    }).then(function (res) {
      if (!res.ok) throw new Error('rpc ' + name + ' failed: ' + res.status);
      return res.status === 204 ? null : res.json();
    });
  }

  // ── Presence ──────────────────────────────────────────────────────────
  // Where this player is, every fifteen seconds while the game is on screen.
  // A hidden tab is not someone playing, so it goes quiet and drops off the
  // dashboard's list on its own.

  var BEAT_EVERY = 15000;

  function beat() {
    var gv = identity();
    var room = rooms();
    if (!gv || document.visibilityState === 'hidden') return;
    var state = room ? room.state() : { code: null, role: null };
    rpc('polytrack_presence_beat', {
      p_visitor_id: gv.id(),
      p_name: gv.realName(),
      p_code: state.code,
      p_role: state.role
    }).catch(function (error) { console.error('Presence beat failed:', error); });
  }

  // ── Driving the game ──────────────────────────────────────────────────
  // Everything below moves through the game's own screens by clicking what a
  // player would click, and waits to see each screen arrive before the next
  // step, because none of them appear straight away.

  function visible(el) {
    return !!el && el.offsetParent !== null;
  }

  function waitFor(test, timeout) {
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      (function check() {
        var found = null;
        try { found = test(); } catch (e) { found = null; }
        if (found) return resolve(found);
        if (Date.now() - started > timeout) return reject(new Error('timed out waiting for the game'));
        setTimeout(check, 200);
      }());
    });
  }

  function buttonNamed(root, text) {
    if (!root) return null;
    var all = root.querySelectorAll('button');
    for (var i = 0; i < all.length; i++) {
      if (visible(all[i]) && all[i].textContent.trim() === text) return all[i];
    }
    return null;
  }

  function menuFront() {
    var info = document.querySelector('.menu-ui > .info');
    return visible(info) ? document.querySelector('.menu-ui') : null;
  }

  // From wherever the player is to the front of the menu. A race is left by
  // its own Exit button, confirmed if the game asks; anything else steps back
  // a screen at a time with Escape, which is what the game binds it to.
  function toMenu() {
    var tries = 0;
    return new Promise(function (resolve, reject) {
      (function step() {
        if (menuFront()) return resolve();
        if (tries++ > 12) return reject(new Error('could not reach the menu'));
        var confirm = buttonNamed(document, 'Confirm');
        var exit = buttonNamed(document.querySelector('.game-toolbar-ui'), 'Exit');
        if (confirm) confirm.click();
        else if (exit) exit.click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        setTimeout(step, 700);
      }());
    });
  }

  // rooms_ui.js renames the tile, and may not have got to it yet.
  function openRooms() {
    var labels = document.querySelectorAll('.menu-ui .button-image > p');
    for (var i = 0; i < labels.length; i++) {
      var text = labels[i].textContent;
      if (text !== 'Rooms' && text !== 'Multiplayer') continue;
      (labels[i].closest('button') || labels[i].parentElement).click();
      return true;
    }
    return false;
  }

  function start() {
    var gv = identity();
    var room = rooms();
    if (!gv) return;
    gv.ready.then(beat);
    setInterval(beat, BEAT_EVERY);
    // Joining or leaving a room is exactly what the dashboard is waiting to
    // see, so it is reported straight away rather than on the next beat.
    if (room) room.onState(beat);
    document.addEventListener('visibilitychange', beat);
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}());

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
    }).then(function (reply) {
      if (reply && reply.call) hostNow();
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

  // ── Opening a room for the creator ────────────────────────────────────
  // Asked for from the dashboard, for a player racing on their own. Nothing
  // is asked of them: the race they are in ends, a private room opens on the
  // same track, and the owner follows them in. The notice they get when the
  // owner arrives is how they find out.

  var hosting = false;

  // The game keeps more than one picker in the document and the newest one
  // is the one just opened.
  function newestPicker() {
    var all = document.querySelectorAll('.track-selection-ui:not(.hidden)');
    return all.length ? all[all.length - 1] : null;
  }

  // A community or custom track is not one this can find by name, so the room
  // opens on the first official track rather than not opening at all.
  function pickTrack(name) {
    return waitFor(function () {
      var picker = newestPicker();
      var cards = picker ? picker.querySelectorAll('.track') : [];
      return cards.length ? cards : null;
    }, 8000).then(function (cards) {
      var chosen = null;
      for (var i = 0; i < cards.length && !chosen; i++) {
        var title = cards[i].querySelector('.track-title');
        if (name && title && title.textContent.trim() === name) chosen = cards[i];
      }
      (chosen || cards[0]).querySelector('button').click();
    });
  }

  // What the player last chose on the host panel, which this room overrides
  // and the next one they open themselves should get back.
  function savedPublic() {
    try {
      var saved = JSON.parse(localStorage.getItem('gv.rooms.settings') || '{}') || {};
      return saved.visibility === 'public';
    } catch (e) { return false; }
  }

  function hostNow() {
    var room = rooms();
    if (hosting || !room || room.state().code !== null) return;
    hosting = true;
    var shown = document.querySelector('.game-toolbar-ui .track-name');
    var track = shown ? shown.textContent.trim() : null;

    toMenu()
      .then(function () {
        if (!openRooms()) throw new Error('no Rooms tile on the menu');
        return waitFor(function () {
          return buttonNamed(document.querySelector('.multiplayer-ui > .join'), 'Host');
        }, 8000);
      })
      .then(function (host) {
        host.click();
        return waitFor(function () {
          var button = document.querySelector('.multiplayer-ui > .host .track-button');
          return visible(button) ? button : null;
        }, 8000);
      })
      .then(function (trackButton) {
        trackButton.click();
        return pickTrack(track);
      })
      .then(function () {
        return waitFor(function () {
          var go = buttonNamed(document.querySelector('.multiplayer-ui > .host .buttons'), 'Host');
          return go && !go.disabled ? go : null;
        }, 8000);
      })
      .then(function (go) {
        // Just the two of them: a room nobody else can find in the list.
        room.setPublic(false);
        go.click();
        return waitFor(function () { return room.state().code; }, 20000);
      })
      .then(function () { room.setPublic(savedPublic()); })
      .catch(function (error) { console.error('Could not open a room for the creator:', error); })
      .then(function () { hosting = false; });
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

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
      if (reply && reply.call) armHost();
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
        else sendEscape();
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

  // ── The cover ─────────────────────────────────────────────────────────
  // Whatever the game has to click through to change sessions happens under
  // this, so the screen shows one picture the whole time instead of menus
  // flashing past. It sits over everything, the game's own interface
  // included, and takes the clicks so none land on the screens underneath.

  var COVER_STYLE_ID = 'gv-cover-style';

  var COVER_STYLE = [
    '.gv-cover {',
    '  position: fixed; left: 0; top: 0; width: 100%; height: 100%;',
    '  z-index: 2147483647; background: #10183a center / 100% 100% no-repeat;',
    '  transition: opacity 0.35s ease; }',
    '.gv-cover.gv-cover-out { opacity: 0; pointer-events: none; }',
    '.gv-cover-text {',
    '  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);',
    '  max-width: 80%; padding: 14px 22px; box-sizing: border-box;',
    '  background: rgba(17, 32, 82, 0.92); color: #fff; text-align: center;',
    '  font: 24px/1.3 ForcedSquare, sans-serif; }'
  ].join('\n');

  var cover = null;

  function coverText(text) {
    if (!cover) return;
    var line = cover.querySelector('.gv-cover-text');
    if (!text) {
      if (line) line.remove();
      return;
    }
    if (!line) {
      line = document.createElement('div');
      line.className = 'gv-cover-text';
      cover.appendChild(line);
    }
    line.textContent = text;
  }

  function showCover(picture, text) {
    if (!document.getElementById(COVER_STYLE_ID)) {
      var css = document.createElement('style');
      css.id = COVER_STYLE_ID;
      css.textContent = COVER_STYLE;
      document.head.appendChild(css);
    }
    if (!cover) {
      cover = document.createElement('div');
      cover.className = 'gv-cover';
      document.body.appendChild(cover);
    }
    if (picture) cover.style.backgroundImage = 'url(' + picture + ')';
    coverText(text);
  }

  // Keys pressed under the cover would drive the menus being clicked through:
  // a stray Escape backs out of them, Enter presses whatever has focus. They
  // are held back until it lifts, apart from the Escapes this file sends
  // itself. Releases still go through, so a key held down when the cover
  // went up is not left stuck down behind it.
  var sending = false;

  function holdKeys(e) {
    if (!cover || sending) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  }

  function sendEscape() {
    sending = true;
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    } finally {
      sending = false;
    }
  }

  // Faded rather than dropped, so the game coming back reads as a cut.
  function hideCover() {
    if (!cover) return;
    var leaving = cover;
    cover = null;
    leaving.classList.add('gv-cover-out');
    setTimeout(function () { leaving.remove(); }, 400);
  }

  // ── Opening a room for the creator ────────────────────────────────────
  // Asked for from the dashboard, for a player racing on their own. Nothing
  // is asked of them: once their run is over, a private room opens on the
  // same track and the owner follows them in. The notice they get when the
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

  // A solo player mid-run is not pulled out of it. The room waits for the
  // run to end on their terms: the next time they start over, which is T or
  // Backspace, or R twice, since a single R only goes back a checkpoint.
  // Leaving the race themselves counts too. A call that has waited longer
  // than the dashboard will is dropped rather than opening an empty room.
  var ARM_FOR = 170000;
  var armed = null;

  function inRace() {
    return visible(document.querySelector('.game-toolbar-ui'));
  }

  function armHost() {
    var room = rooms();
    if (armed || hosting || !room || room.state().code !== null) return;
    if (!inRace()) {
      hostNow();
      return;
    }
    var until = Date.now() + ARM_FOR;
    var lastR = 0;

    function disarm() {
      window.removeEventListener('keydown', onKey, true);
      clearInterval(armed);
      armed = null;
    }
    function fire() {
      disarm();
      hostNow();
    }
    function onKey(e) {
      if (e.repeat) return;
      if (e.code === 'KeyT' || e.code === 'Backspace') fire();
      else if (e.code === 'KeyR') {
        if (Date.now() - lastR < 1000) fire();
        else lastR = Date.now();
      }
    }

    armed = setInterval(function () {
      if (Date.now() > until) disarm();
      else if (!inRace()) fire();
    }, 500);
    window.addEventListener('keydown', onKey, true);
  }

  // ── The creator's own game ────────────────────────────────────────────
  // Opened by the dashboard with the room to join and a ticket proving who is
  // joining: #gv-creator=<ticket>&join=<code>. The game is walked into the
  // room the way a player typing the code in would get there.

  var creatorTicket = null;

  function readVisit() {
    var params = new URLSearchParams(location.hash.slice(1));
    var ticket = params.get('gv-creator');
    var code = params.get('join');
    if (!ticket || !code) return null;
    // Out of the address bar, so a reload or a copied link is an ordinary
    // visit rather than a second arrival.
    history.replaceState(null, '', location.pathname + location.search);
    return { ticket: ticket, code: code };
  }

  function joinAsCreator(visit) {
    creatorTicket = visit.ticket;
    waitFor(function () {
      return menuFront() || document.querySelector('.game-toolbar-ui');
    }, 60000)
      .then(toMenu)
      .then(function () {
        if (!openRooms()) throw new Error('no Rooms tile on the menu');
        return waitFor(function () {
          var input = document.querySelector('.multiplayer-ui > .join .invite-code');
          return visible(input) ? input : null;
        }, 8000);
      })
      .then(function (input) {
        input.value = visit.code;
        input.dispatchEvent(new Event('input'));
        var join = document.querySelector('.multiplayer-ui > .join > .main-box > .buttons > .join');
        if (!join) throw new Error('no Join button');
        join.click();
      })
      .catch(function (error) { console.error('Could not join as the creator:', error); });
  }

  // Once in, the room is told who arrived. Said a few times over the first
  // seconds, because a game still settling into the room can miss one.
  function announce(state) {
    var room = rooms();
    if (!creatorTicket || !room || state.role !== 'player' || !state.code) return;
    var ticket = creatorTicket;
    creatorTicket = null;
    [0, 2000, 6000].forEach(function (delay) {
      setTimeout(function () { room.say({ kind: 'creator', ticket: ticket }); }, delay);
    });
  }

  // ── The notice ────────────────────────────────────────────────────────
  // Anyone holding the room code can say anything on the room's channel, so
  // the creator's message is only believed once its ticket checks out.
  // Checked once per ticket, whichever of the repeats arrives first.

  var checked = {};

  var STYLE_ID = 'gv-creator-style';

  // Off to the side, above the speedometer, where nothing in a race is drawn,
  // and it stays until dismissed rather than vanishing before it is read.
  var STYLE = [
    '.gv-creator-notice {',
    '  position: absolute; right: 20px; bottom: 110px; z-index: 5;',
    '  display: flex; align-items: center; gap: 14px; max-width: 460px;',
    '  padding: 10px 10px 10px 18px; box-sizing: border-box;',
    '  background-color: var(--surface-color); border-left: 4px solid #1d9bf0;',
    '  color: var(--text-color); font-size: 22px; line-height: 1.25;',
    // #ui is pointer-events: none so the canvas can be dragged through it.
    '  pointer-events: auto; }',
    '.gv-creator-notice > .button { margin: 0; padding: 4px 14px; font-size: 22px; }'
  ].join('\n');

  function showNotice() {
    var ui = document.getElementById('ui');
    if (!ui || ui.querySelector('.gv-creator-notice')) return;
    if (!document.getElementById(STYLE_ID)) {
      var css = document.createElement('style');
      css.id = STYLE_ID;
      css.textContent = STYLE;
      document.head.appendChild(css);
    }

    var notice = document.createElement('div');
    notice.className = 'gv-creator-notice';
    notice.setAttribute('role', 'status');

    var text = document.createElement('span');
    text.textContent = 'The GameVault creator joined the room';
    notice.appendChild(text);

    var close = document.createElement('button');
    close.className = 'button';
    close.textContent = '\u00d7';
    close.setAttribute('aria-label', 'Dismiss');
    close.addEventListener('click', function () { notice.remove(); });
    notice.appendChild(close);

    ui.appendChild(notice);
  }

  function heard(payload) {
    var room = rooms();
    if (!room || !payload || payload.kind !== 'creator' || typeof payload.ticket !== 'string') return;
    if (checked[payload.ticket]) return;
    checked[payload.ticket] = true;
    // The channel is live a moment before this page knows which room it is
    // in, so the code may not be there yet.
    waitFor(function () { return room.state().code; }, 5000)
      .then(function (code) {
        return rpc('gv_creator_check', { p_code: code, p_ticket: payload.ticket });
      })
      .then(function (genuine) { if (genuine === true) showNotice(); })
      .catch(function (error) { console.error('Could not check the creator ticket:', error); });
  }

  function start() {
    var gv = identity();
    var room = rooms();
    if (!gv) return;
    gv.ready.then(beat);
    setInterval(beat, BEAT_EVERY);
    // Joining or leaving a room is exactly what the dashboard is waiting to
    // see, so it is reported straight away rather than on the next beat.
    if (room) {
      room.onState(beat);
      room.onState(announce);
      room.onMessage(heard);
    }
    document.addEventListener('visibilitychange', beat);
    window.addEventListener('keydown', holdKeys, true);

    var visit = readVisit();
    if (visit) joinAsCreator(visit);
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}());

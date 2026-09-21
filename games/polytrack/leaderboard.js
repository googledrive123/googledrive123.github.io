// Site leaderboard for PolyTrack.
//
// The game talks to vps.kodub.com, which only answers official builds, so the
// board here is always empty and the game reports "Failed to load". This file
// answers those same requests from the site's own Supabase instead, so a time
// set here is ranked against everyone else who plays here.
//
// It works by standing in front of XMLHttpRequest rather than by editing
// main.bundle.js. The game's bundle stays byte-for-byte what Kodub shipped,
// which means dropping in a newer PolyTrack does not mean redoing any of this.
// Anything not addressed to vps.kodub.com is handed to the real XHR untouched.
//
// Loaded before main.bundle.js in index.html. Must stay before it: the game
// captures XMLHttpRequest when its own module initialises.
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  var AUTH_KEY = 'sb-dxwjxzmlezfyursysays-auth-token';
  var HOST = 'vps.kodub.com';

  var NativeXHR = window.XMLHttpRequest;

  // ── Identity ──────────────────────────────────────────────────────────
  // The game runs from /games/polytrack/, same origin as the site, so the
  // session the site already established is readable here. No message passing,
  // no second sign-in.

  function accessToken() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return (parsed && parsed.access_token) || null;
    } catch (e) { return null; }
  }

  function identity() {
    return (window.GV && window.GV.identity) || null;
  }

  // Guests are keyed by the browser's visitor id. js/identity.js keeps that id
  // in localStorage, a cookie and IndexedDB at once and reads it back from
  // whichever survived, which is what stops one person turning into two rows
  // on the board a day apart.
  function visitorId() {
    var gv = identity();
    if (gv) return gv.id();
    try { return localStorage.getItem('gv.vid') || null; } catch (e) { return null; }
  }

  // IndexedDB is the store most likely to still be holding an id the other two
  // have lost, and it is the one that only answers asynchronously. Nothing is
  // filed under an identity before it has had its say.
  function settled() {
    var gv = identity();
    return gv ? gv.ready : Promise.resolve(null);
  }

  function rpc(name, body) {
    var token = accessToken();
    return fetch(SUPA_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + (token || SUPA_KEY)
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error(t || res.status); });
      return res.status === 204 ? null : res.json();
    });
  }

  // ── Request parsing ───────────────────────────────────────────────────

  function queryOf(url) {
    var out = {};
    var q = url.indexOf('?');
    if (q < 0) return out;
    url.slice(q + 1).split('&').forEach(function (pair) {
      if (!pair) return;
      var eq = pair.indexOf('=');
      var k = eq < 0 ? pair : pair.slice(0, eq);
      var v = eq < 0 ? '' : pair.slice(eq + 1);
      try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); }
      catch (e) { out[k] = v; }
    });
    return out;
  }

  function endpointOf(url) {
    var m = /vps\.kodub\.com\/v\d+\/([^?]*)/.exec(url);
    return m ? m[1] : null;
  }

  // ── Handlers ──────────────────────────────────────────────────────────
  // Each returns a promise of the JSON the game expects. Shapes are validated
  // strictly by the bundle — a missing field is reported to the player as a
  // leaderboard error, so they are built to match exactly.

  function getBoard(q) {
    return rpc('polytrack_board', {
      p_track_id: q.trackId || '',
      p_skip: parseInt(q.skip || '0', 10) || 0,
      p_amount: parseInt(q.amount || '50', 10) || 50,
      p_visitor_id: visitorId()
    }).then(function (board) {
      return board || { total: 0, entries: [], userEntry: null };
    });
  }

  function getUserEntry(q) {
    // No dedicated endpoint: the board already computes the caller's standing,
    // and asking for one row is not worth a second function.
    return getBoard({ trackId: q.trackId, skip: '0', amount: '1' })
      .then(function (board) { return board.userEntry || null; });
  }

  function submit(body) {
    var q = queryOf('?' + body);
    var frames = parseInt(q.frames || '0', 10);
    if (!frames || frames < 1) throw new Error('invalid frames');

    // Whatever the player typed into the game's own profile is the name they
    // already chose to race under, so it is kept rather than overwritten the
    // first time a run goes up. "Anonymous" is the game's untouched default
    // and is not a choice.
    var gv = identity();
    if (gv && q.nickname && q.nickname !== 'Anonymous'
        && !gv.chosenName() && !gv.accountName()) {
      gv.setChosenName(q.nickname);
    }

    // Read the standing before and after so the game can show the "moved up
    // from Nth" animation it plays on a personal best.
    var trackId = q.trackId || '';
    return getBoard({ trackId: trackId, skip: '0', amount: '1' }).then(function (before) {
      var previous = before.userEntry ? before.userEntry.position : null;
      return rpc('polytrack_submit', {
        p_track_id: trackId,
        p_frames: frames,
        p_nickname: gv ? gv.publicName() : (q.nickname || 'Player'),
        p_country_code: q.countryCode || null,
        p_car_style: q.carStyle || null,
        p_visitor_id: visitorId()
      }).then(function () {
        return getBoard({ trackId: trackId, skip: '0', amount: '1' });
      }).then(function (after) {
        var entry = after.userEntry;
        if (!entry) return null;
        if (previous == null) return entry.id;
        return {
          uploadId: entry.id,
          positionChange: { previousPosition: previous, newPosition: entry.position }
        };
      });
    });
  }

  function getUser() {
    // The game keeps its own profile locally and sends it on submit, so there
    // is nothing extra to store. Returning null lets it use what it has.
    return Promise.resolve(null);
  }

  // Recordings are the ghost-replay data. Nothing here stores them, and the
  // shape allows nulls, so every id resolves to "no replay available".
  function getRecordings(q) {
    var ids = (q.ids || '').split(',').filter(Boolean);
    return Promise.resolve(ids.map(function () { return null; }));
  }

  var HANDLED = [
    'leaderboard', 'leaderboardUserEntry', 'user',
    'recordings', 'verifyRecordings', 'iceServers'
  ];

  // Asked at open(), before any body exists, so it must not touch the
  // handlers — deciding by calling route() would fire a submit on every POST.
  function handles(url) {
    return String(url).indexOf(HOST) >= 0 && HANDLED.indexOf(endpointOf(url)) >= 0;
  }

  function route(method, url, body) {
    var endpoint = endpointOf(url);
    var q = queryOf(url);
    if (endpoint === 'leaderboard') {
      return method === 'POST' ? submit(body) : getBoard(q);
    }
    if (endpoint === 'leaderboardUserEntry') return getUserEntry(q);
    if (endpoint === 'user') return method === 'POST' ? Promise.resolve(null) : getUser();
    if (endpoint === 'recordings') return getRecordings(q);
    if (endpoint === 'verifyRecordings') {
      return Promise.resolve({ unverifiedRecordings: [], exhaustive: true, estimatedRemaining: 0 });
    }
    if (endpoint === 'iceServers') return Promise.resolve([]);
    return null; // Not ours — caller falls through to the real network.
  }

  // ── The stand-in ──────────────────────────────────────────────────────
  // Mimics only what the bundle touches: readyState, status, responseText,
  // onreadystatechange, timeout, overrideMimeType, setRequestHeader.

  function FakeXHR() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.onreadystatechange = null;
    this.onerror = null;
    this.ontimeout = null;
    this.onload = null;
    this.timeout = 0;
    this._method = 'GET';
    this._url = '';
  }
  FakeXHR.prototype.open = function (method, url) {
    this._method = String(method || 'GET').toUpperCase();
    this._url = url;
    this.readyState = 1;
  };
  FakeXHR.prototype.setRequestHeader = function () {};
  FakeXHR.prototype.overrideMimeType = function () {};
  FakeXHR.prototype.getAllResponseHeaders = function () { return ''; };
  FakeXHR.prototype.getResponseHeader = function () { return null; };
  FakeXHR.prototype.abort = function () { this.readyState = 0; };
  FakeXHR.prototype.addEventListener = function (type, fn) {
    if (type === 'readystatechange') this.onreadystatechange = fn;
    if (type === 'error') this.onerror = fn;
    if (type === 'load') this.onload = fn;
  };
  FakeXHR.prototype.removeEventListener = function () {};
  FakeXHR.prototype._finish = function (status, text) {
    this.status = status;
    this.responseText = text;
    this.readyState = 4;
    try { if (this.onreadystatechange) this.onreadystatechange(); } catch (e) { console.error(e); }
    try { if (this.onload) this.onload(); } catch (e) { console.error(e); }
  };
  FakeXHR.prototype.send = function (body) {
    var self = this;
    var pending = settled().then(function () {
      return route(self._method, self._url, body);
    });
    pending.then(function (data) {
      self._finish(200, data === null ? 'null' : JSON.stringify(data));
    }).catch(function (err) {
      console.error('[leaderboard]', err);
      // A non-200 is what the bundle already expects from a server problem, so
      // it shows its normal error rather than an unhandled rejection.
      self._finish(500, '');
    });
  };
  FakeXHR.UNSENT = 0;
  FakeXHR.OPENED = 1;
  FakeXHR.HEADERS_RECEIVED = 2;
  FakeXHR.LOADING = 3;
  FakeXHR.DONE = 4;

  function PatchedXHR() {
    var real = new NativeXHR();
    var fake = new FakeXHR();
    var chosen = null;
    var self = this;

    // Which object serves the call is only known at open(), so both exist until
    // then and every property is mirrored off whichever one is chosen.
    this.open = function (method, url) {
      chosen = handles(url) ? fake : real;
      chosen.open.apply(chosen, arguments);
      sync();
    };
    this.send = function (body) {
      var target = chosen || real;
      var prior = target.onreadystatechange;
      target.onreadystatechange = function () {
        sync();
        if (self.onreadystatechange) self.onreadystatechange();
        if (prior) prior();
      };
      target.send(body);
    };
    ['setRequestHeader', 'overrideMimeType', 'abort',
     'getAllResponseHeaders', 'getResponseHeader'].forEach(function (name) {
      self[name] = function () {
        var target = chosen || real;
        return target[name] ? target[name].apply(target, arguments) : undefined;
      };
    });
    this.addEventListener = function (type, fn) {
      var target = chosen || real;
      target.addEventListener(type, function () { sync(); fn.apply(self, arguments); });
    };
    this.removeEventListener = function () {};

    function sync() {
      var target = chosen || real;
      self.readyState = target.readyState;
      self.status = target.status;
      try { self.responseText = target.responseText; } catch (e) { self.responseText = ''; }
    }

    Object.defineProperty(this, 'timeout', {
      get: function () { return (chosen || real).timeout; },
      set: function (v) { real.timeout = v; fake.timeout = v; }
    });

    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.onreadystatechange = null;
  }
  PatchedXHR.UNSENT = 0;
  PatchedXHR.OPENED = 1;
  PatchedXHR.HEADERS_RECEIVED = 2;
  PatchedXHR.LOADING = 3;
  PatchedXHR.DONE = 4;

  window.XMLHttpRequest = PatchedXHR;

  // ── Verified / unverified labelling ───────────────────────────────────
  // The game has three states: Pending, Verified, Invalid. None of them mean
  // "guest", and the icon it draws for a guest reads as Pending — which
  // promises a verification that is never coming, because nothing here can
  // check a run. So the icon is replaced with a plain word.
  //
  // Verified means the time is tied to a signed-in account. Unverified means
  // it is not, and nothing proves who set it. Both are done by rewriting the
  // rendered rows, so the bundle stays untouched.

  var STYLE_ID = 'gv-leaderboard-style';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = [
      // The row is a fixed 100px with a clip-path, so a third line only fits
      // if the two the game already draws give some space back.
      '.leaderboard-ui > .container > button.main > .left {',
      '  display: inline-flex; flex-direction: column; justify-content: center;',
      '  height: 100px; box-sizing: border-box; }',
      '.leaderboard-ui > .container > button.main > .left > p { padding: 2px 12px; }',
      '.leaderboard-ui > .container > button.main > .left > p.gv-verify {',
      '  margin: 0; padding: 2px 12px 0 12px; font-size: 15px; line-height: 1.1; }',
      // The game colours every row paragraph with a 3-class selector, which
      // outranks a bare .gv-yes, so these have to match its depth to win.
      '.leaderboard-ui > .container > button.main > .left > p.gv-verify.gv-yes { color: #5f5; }',
      '.leaderboard-ui > .container > button.main > .left > p.gv-verify.gv-no { color: #f55; }',
      '.leaderboard-ui > .container > button.main > .right > .verified-state > img { display: none; }',
      // Mirrors .total-players, which sits in the opposite corner.
      '.leaderboard-ui > .gv-info {',
      '  margin: 10px; position: absolute; left: 0; top: 0; z-index: 3;',
      '  width: 22px; height: 22px; padding: 0; line-height: 22px;',
      '  font: inherit; font-size: 15px; text-align: center; cursor: pointer;',
      '  color: var(--text-color); background-color: var(--button-color);',
      '  border: none; border-radius: 50%;',
      // #ui is pointer-events: none so the canvas stays draggable through it.
      // Every interactive element in the game opts back in; this must too.
      '  pointer-events: auto; }',
      '.leaderboard-ui > .gv-info:hover { background-color: var(--button-hover-color); }',
      '.gv-dialog { position: absolute; left: 0; top: 0; z-index: 10;',
      '  width: 100%; height: 100%; background-color: rgba(20, 20, 30, 0.5);',
      '  pointer-events: auto; }',
      '.gv-dialog > div { position: absolute; left: calc(50% - 250px); top: 25%;',
      '  width: 500px; box-sizing: border-box; padding: 10px;',
      '  background-color: var(--surface-color); text-align: center; }',
      '.gv-dialog > div > p { margin: 0 0 10px 0; padding: 10px; text-align: left;',
      '  background-color: var(--surface-secondary-color); font-size: 19px;',
      '  line-height: 1.25; color: var(--text-color); }',
      '.gv-dialog b.gv-yes { color: #5f5; }',
      '.gv-dialog b.gv-no { color: #f55; }'
    ].join('\n');
    document.head.appendChild(css);
  }

  function labelRow(row) {
    if (row.dataset.gvLabelled) return;
    var state = row.querySelector('.verified-state');
    var left = row.querySelector('.left');
    if (!state || !left) return;
    row.dataset.gvLabelled = '1';

    var verified = state.classList.contains('verified');
    var label = document.createElement('p');
    label.className = 'gv-verify ' + (verified ? 'gv-yes' : 'gv-no');
    label.textContent = verified ? 'Verified' : 'Unverified';
    left.appendChild(label);
    state.title = verified
      ? 'Verified - set while signed in'
      : 'Unverified - set without signing in';
  }

  function showInfo() {
    var panel = document.querySelector('.leaderboard-ui');
    if (!panel || panel.querySelector('.gv-dialog')) return;
    var wrap = document.createElement('div');
    wrap.className = 'gv-dialog';
    var box = document.createElement('div');
    var text = document.createElement('p');
    text.innerHTML =
      '<b class="gv-yes">Verified</b> means the time was set while signed in to ' +
      'GameVault, so it belongs to a known account.<br><br>' +
      '<b class="gv-no">Unverified</b> means it was set without signing in. ' +
      'The run still counts and still appears here, but nothing proves who set ' +
      'it, so unverified times are ranked below verified ones.<br><br>' +
      'Sign in before racing to have your times verified.';
    var ok = document.createElement('button');
    ok.className = 'button';
    ok.textContent = 'Ok';
    ok.addEventListener('click', function () { wrap.remove(); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.remove(); });
    box.appendChild(text);
    box.appendChild(ok);
    wrap.appendChild(box);
    panel.appendChild(wrap);
  }

  function ensureInfoButton(panel) {
    if (panel.querySelector('.gv-info')) return;
    var btn = document.createElement('button');
    btn.className = 'gv-info';
    btn.type = 'button';
    btn.textContent = 'i';
    btn.title = 'What does Verified mean?';
    btn.setAttribute('aria-label', 'What does Verified mean?');
    btn.addEventListener('click', showInfo);
    panel.appendChild(btn);
  }

  function decorate() {
    var panel = document.querySelector('.leaderboard-ui');
    if (!panel) return;
    ensureStyles();
    ensureInfoButton(panel);
    // Rows are rebuilt on every page change, so this re-runs rather than
    // assuming the ones seen first are the only ones.
    panel.querySelectorAll('.container > button.main').forEach(labelRow);
  }

  function watch() {
    new MutationObserver(decorate)
      .observe(document.body, { childList: true, subtree: true });
    decorate();
  }

  if (document.body) watch();
  else document.addEventListener('DOMContentLoaded', watch);
})();

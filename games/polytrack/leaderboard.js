// Site leaderboard for PolyTrack.
//
// The game talks to vps.kodub.com, which only answers official builds, so the
// board here is always empty and the game reports "Failed to load". This file
// answers those same requests from the site's own Supabase instead, so a time
// set here is ranked against everyone else who plays here.
//
// It works by standing in front of XMLHttpRequest rather than by editing
// main.bundle.js. The game's bundle stays what Kodub shipped, which means
// dropping in a newer PolyTrack does not mean redoing any of this, with one
// exception: the weekly challenge's line in the finish handler (see "Weekly
// challenge" below). Anything not addressed to vps.kodub.com is handed to the
// real XHR untouched.
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

  function session() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function accessToken() {
    var s = session();
    return (s && s.access_token) || null;
  }

  // Half a minute of slack, so a token is not sent with seconds left on it.
  function fresh(s) {
    return !!(s && s.access_token)
      && (!s.expires_at || s.expires_at * 1000 > Date.now() + 30000);
  }

  // The site refreshes the session every hour, but a tab left alone or a
  // laptop that slept comes back with the old token still stored, and the
  // board refuses an expired token outright. The game shows that as "Failed
  // to load". So a stale token waits a moment for the site's new one, the way
  // save.js does, and the board is asked as a guest if none comes.
  var TOKEN_WAIT_MS = 4000;
  // A token already waited on once and never replaced. With nothing around the
  // game to refresh it, every request would otherwise sit out the wait again.
  var gaveUpOn = null;

  function liveToken() {
    var s = session();
    if (!s || !s.access_token) return Promise.resolve(null);
    if (fresh(s)) return Promise.resolve(s.access_token);
    if (s.access_token === gaveUpOn) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var timer = setTimeout(function () {
        gaveUpOn = s.access_token;
        finish(null);
      }, TOKEN_WAIT_MS);
      function check(e) {
        if (e.key !== AUTH_KEY) return;
        var next = session();
        if (fresh(next)) finish(next.access_token);
        else if (!next || !next.access_token) finish(null);
      }
      function finish(token) {
        clearTimeout(timer);
        window.removeEventListener('storage', check);
        resolve(token);
      }
      window.addEventListener('storage', check);
    });
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

  // Right after a laptop wakes, the first request can leave before the
  // network is back, so one that never got an answer is tried once more.
  function send(name, body, token, retried) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + (token || SUPA_KEY)
      },
      body: JSON.stringify(body)
    }).catch(function (err) {
      if (retried) throw err;
      return new Promise(function (wait) { setTimeout(wait, 1000); }).then(function () {
        return send(name, body, token, true);
      });
    });
  }

  function rpc(name, body) {
    return liveToken().then(function (token) {
      // A token that looks fine can still be refused, and a guest's answer
      // beats "Failed to load".
      return send(name, body, token).then(function (res) {
        return res.status === 401 && token ? send(name, body, null) : res;
      });
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

  // Where the caller stands on the board they last asked for. The row
  // decoration further down needs it, and the DOM has no idea who anyone is.
  var selfPosition = null;

  // The game picks its own row out by comparing each entry's userId against
  // the profile token hash it sent up with the request. The board answers with
  // its own key for that player instead, so nothing ever matched and the row
  // was never marked. Relabelling the one row the board named as the caller's
  // is enough to light up the highlight and the "(You)" the game already
  // draws for it.
  function markSelfEntry(board, tokenHash) {
    if (!tokenHash || !board.userEntry) return;
    var entries = board.entries || [];
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === board.userEntry.id) entries[i].userId = tokenHash;
    }
  }

  // Which rows carry the blue check from analytics/verified.sql, by position.
  // The game has no field for it, so it is taken off each entry before the
  // game sees the board and drawn onto the row further down. Kept per track:
  // the one-row lookups for the caller's own standing land between full
  // pages, and must add to what is known rather than wipe it.
  var checkedTrack = null;
  var checked = {};
  // Which rows have a replay to watch or race, noted the same way.
  var replays = {};
  // Whose each row is, for their Track of the Week badges (js/badges.js).
  var owners = {};

  function noteChecks(trackId, entries) {
    if (trackId !== checkedTrack) {
      checkedTrack = trackId;
      checked = {};
      replays = {};
      owners = {};
    }
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (typeof entry.position === 'number') {
        checked[entry.position] = entry.gvVerified === true;
        replays[entry.position] = entry.gvReplay === true;
        // Badges would say who an Anonymous row is.
        owners[entry.position] = entry.nickname === 'Anonymous' ? null : entry.userId;
      }
      delete entry.gvVerified;
      delete entry.gvReplay;
    }
  }

  function getBoard(q) {
    return rpc('polytrack_board', {
      p_track_id: q.trackId || '',
      p_skip: parseInt(q.skip || '0', 10) || 0,
      p_amount: parseInt(q.amount || '50', 10) || 50,
      p_visitor_id: visitorId()
    }).then(function (board) {
      board = board || { total: 0, entries: [], userEntry: null };
      noteChecks(q.trackId || '', board.entries || []);
      selfPosition = board.userEntry ? board.userEntry.position : null;
      markSelfEntry(board, q.userTokenHash);
      return board;
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
        p_visitor_id: visitorId(),
        // The replay of this run, which is what other players watch and race
        // against. Already URL-safe as the game writes it.
        p_recording: q.recording || null
      }).then(function () {
        if (challenge) {
          challenge.then(function (c) {
            if (c && c.trackId === trackId && (c.best == null || frames < c.best)) c.best = frames;
          });
        }
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

  // Recordings are the replays behind Watch and racing against someone. The
  // game asks by board row id and wants one answer per id, in order, with
  // null where there is no replay. A time set before replays were kept has
  // none, and nor does anything the server could not answer for.
  function getRecordings(q) {
    var ids = (q.ids || '').split(',').filter(Boolean);
    var numbers = ids.map(function (id) { return parseInt(id, 10); });
    if (numbers.some(function (n) { return !isFinite(n); })) {
      return Promise.resolve(ids.map(function () { return null; }));
    }
    return rpc('polytrack_recordings', { p_ids: numbers }).then(function (list) {
      return ids.map(function (id, at) { return (list && list[at]) || null; });
    }).catch(function (err) {
      console.error('[leaderboard]', err);
      return ids.map(function () { return null; });
    });
  }

  var HANDLED = [
    'leaderboard', 'leaderboardUserEntry', 'user',
    'recordings', 'verifyRecordings', 'iceServers', 'trackOfTheWeek'
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
    // An empty list means WebRTC never gets off the ground, which is what
    // kept multiplayer dead here. rooms.js owns the real list.
    // Track of the Week is served to official builds only, so this request
    // went out to kodub every session and came back refused. The game has a
    // shape for "there is no track this week", and it takes it quietly.
    if (endpoint === 'trackOfTheWeek') {
      return Promise.resolve({ serverTime: new Date().toISOString(), current: null });
    }
    if (endpoint === 'iceServers') {
      var rooms = window.GV && window.GV.rooms;
      return rooms ? rooms.iceServers() : Promise.resolve([]);
    }
    return null; // Not ours — caller falls through to the real network.
  }

  // ── The stand-in ──────────────────────────────────────────────────────
  // Mimics only what the bundle touches: readyState, status, responseText,
  // onreadystatechange, timeout, overrideMimeType, setRequestHeader.

  function FakeXHR() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.response = '';
    this.responseType = '';
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
    this.response = this.responseType === 'json' ? JSON.parse(text || 'null') : text;
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

    // The game loads its audio and its models as arraybuffers. Those two
    // properties were missing here, so responseType never reached the real
    // request and response came back undefined: every sound in the game
    // failed to decode, and the music one surfaced as an error screen.
    // Set before open() as often as after it, so both objects get it.
    Object.defineProperty(this, 'responseType', {
      get: function () { return (chosen || real).responseType; },
      set: function (v) {
        try { real.responseType = v; } catch (e) {}
        fake.responseType = v;
      }
    });
    Object.defineProperty(this, 'response', {
      get: function () {
        try { return (chosen || real).response; } catch (e) { return null; }
      }
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

  // ── Keeping the board's copy of the name current ──────────────────────
  // The name is stamped on every row the player owns. Renaming, or turning
  // anonymous mode on, has to reach times that are already up there: no new
  // run is going to reach them, because nobody re-drives a track just to
  // correct a label.

  var pushedName = null;
  var pushTimer = null;

  function pushName() {
    var gv = identity();
    if (!gv) return;
    var name = gv.publicName();
    if (name === pushedName) return;
    pushedName = name;
    rpc('polytrack_set_name', { p_visitor_id: visitorId(), p_nickname: name })
      .catch(function (err) {
        // Forgotten, so the next push tries again instead of assuming it landed.
        if (pushedName === name) pushedName = null;
        console.error('[leaderboard]', err);
      });
  }

  // Typing in the name field fires on every keystroke.
  function scheduleNamePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushName, 500);
  }

  // Signing in used to leave the guest's times behind under the browser id
  // while the account started again from nothing, which is the other half of
  // seeing yourself twice.
  function claimGuestScores() {
    if (!accessToken()) return Promise.resolve(null);
    return rpc('polytrack_claim', { p_visitor_id: visitorId() })
      .catch(function (err) { console.error('[leaderboard]', err); });
  }

  // ── Weekly challenge ──────────────────────────────────────────────────
  // The game only uploads a run that beats the player's own best on the
  // track. The challenge counts any run that beats their best this week
  // (challenge/challenge.sql), so a run slower than an old personal best can
  // still belong on it. main.bundle.js is changed in one place for this:
  // where the finish handler finds a run is not a new best, it calls
  // window.gvRunFinished(trackId, frames, recording, profileSlot). A newer
  // PolyTrack needs that line put back in.
  //
  // Such a run goes up through polytrack_submit like any other. The board
  // keeps the player's faster time, and the challenge picks up this one.

  // Often enough that a new week's track is noticed in a long session.
  var CHALLENGE_TTL_MS = 5 * 60 * 1000;
  var challenge = null;
  var challengeAt = 0;

  // The week's track and the player's best on it this week, in frames.
  function currentChallenge() {
    if (challenge && Date.now() - challengeAt < CHALLENGE_TTL_MS) return challenge;
    challengeAt = Date.now();
    challenge = settled().then(function () {
      return rpc('gv_challenge_current', { p_visitor_id: visitorId() });
    }).then(function (r) {
      var c = r && r.challenge;
      return c ? { trackId: c.track_id, best: r.you ? r.you.frames : null } : null;
    }).catch(function (err) {
      console.error('[leaderboard]', err);
      challengeAt = 0;
      return null;
    });
    return challenge;
  }

  // The game's own profile for the slot being raced, for the country and car
  // it sends with every run.
  function gameProfile(slot) {
    try { return JSON.parse(localStorage.getItem('polytrack_v5_prod_user_' + slot) || 'null'); }
    catch (e) { return null; }
  }

  window.gvRunFinished = function (trackId, frames, recording, slot) {
    currentChallenge().then(function (c) {
      if (!c || c.trackId !== trackId) return;
      if (c.best != null && frames >= c.best) return;
      var gv = identity();
      var profile = gameProfile(slot) || {};
      return rpc('polytrack_submit', {
        p_track_id: trackId,
        p_frames: frames,
        p_nickname: gv ? gv.publicName() : (profile.nickname || 'Player'),
        p_country_code: profile.countryCode || null,
        p_car_style: typeof profile.carStyle === 'string' ? profile.carStyle : null,
        p_visitor_id: visitorId(),
        p_recording: recording && recording.serialize ? recording.serialize() : null
      }).then(function () {
        if (c.best == null || frames < c.best) c.best = frames;
      });
    }).catch(function (err) { console.error('[leaderboard]', err); });
  };

  // ── Replays kept from before ──────────────────────────────────────────
  // Every time on the board set before replays were kept has none, but the
  // player who set it usually still has it: the game saves the replay of
  // their best run on each track in the browser, under
  // polytrack_v5_prod_record_<slot>_default_<track>. Those are sent up, and
  // the server only takes one that matches the player's own time exactly.

  var RECORD_KEY = /^polytrack_v5_prod_record_\d+_default_(.+)$/;
  var SENT_KEY = 'gv.replays.sent';

  function keptReplays() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        var match = key && RECORD_KEY.exec(key);
        if (!match) continue;
        var record = JSON.parse(localStorage.getItem(key) || 'null');
        if (!record || typeof record.recording !== 'string' || typeof record.frames !== 'number') continue;
        out.push({ track: match[1], frames: record.frames, recording: record.recording });
      }
    } catch (e) {}
    return out;
  }

  // Each is sent once for each way of being on the board. A replay the
  // server turns down is one whose time is not this player's on the board,
  // and sending it again changes nothing, but signing in moves the times to
  // an account and gives the same replays somewhere new to go.
  function sentKey(replay) {
    return (accessToken() ? 'account:' : 'guest:') + replay.track + ':' + replay.frames;
  }

  function sendKeptReplays() {
    var sent = [];
    try { sent = JSON.parse(localStorage.getItem(SENT_KEY) || '[]') || []; } catch (e) { sent = []; }
    var todo = keptReplays().filter(function (replay) { return sent.indexOf(sentKey(replay)) < 0; });
    var batches = [];
    for (var i = 0; i < todo.length; i += 10) batches.push(todo.slice(i, i + 10));
    return batches.reduce(function (chain, batch) {
      return chain.then(function () {
        return rpc('polytrack_attach_replays', { p_visitor_id: visitorId(), p_items: batch }).then(function () {
          batch.forEach(function (replay) { sent.push(sentKey(replay)); });
          try { localStorage.setItem(SENT_KEY, JSON.stringify(sent)); } catch (e) {}
        });
      });
    }, Promise.resolve()).catch(function (err) { console.error('[leaderboard]', err); });
  }

  settled().then(function () {
    // Claimed first, so a signed-in player's guest times are already on the
    // account when their replays arrive. A few seconds in, so this does not
    // compete with the game loading.
    Promise.resolve(claimGuestScores()).then(function () {
      // A username changed while the game was closed never reached the times
      // already up, which kept the old name with the new one in brackets.
      // Only once the account's name is here, so they are not relabelled with
      // a guest name on the way.
      var gv = identity();
      if (accessToken() && gv && gv.accountName()) pushName();
      setTimeout(sendKeptReplays, 5000);
    });
    var gv = identity();
    if (gv) gv.onChange(scheduleNamePush);
  });

  // The game sits in an iframe on a page that owns the session, so signing in
  // or out happens in the other document and arrives here as a storage event.
  window.addEventListener('storage', function (e) {
    if (!e || (e.key !== AUTH_KEY && e.key !== 'gv.username')) return;
    Promise.resolve(claimGuestScores()).then(sendKeptReplays);
    scheduleNamePush();
  });

  // ── Signed in / guest labelling ───────────────────────────────────────
  // The game has three states: Pending, Verified, Invalid. None of them mean
  // "guest", and the icon it draws for a guest reads as Pending — which
  // promises a verification that is never coming, because nothing here can
  // check a run. So the icon is replaced with a plain word.
  //
  // Signed in means the time is tied to a GameVault account. Guest means it
  // is not, and nothing proves who set it. These used to read Verified and
  // Unverified, which is now the word for the blue check, so they say what
  // they actually mean. Both are done by rewriting the rendered rows, so the
  // bundle stays untouched.

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
      // Sits between the name and the game's own "(You)", quiet enough to
      // read as an aside rather than as a second name. That "(You)" carries a
      // -16px left margin, so the gap on the right pays for it too.
      '.leaderboard-ui .gv-realname {',
      '  margin-left: 8px; margin-right: 22px; font-size: 19px;',
      '  opacity: 0.55; white-space: nowrap; }',
      // Mirrors .total-players, which sits in the opposite corner.
      // The game's "(You)" pulls itself 16px left to sit against the name.
      // The right margin gives that back so it does not land on the check.
      '.leaderboard-ui .gv-check {',
      '  width: 24px; height: 24px; flex-shrink: 0; margin: 0 14px 0 -4px; }',
      '.leaderboard-ui .gv-badges { margin: 0 20px 0 -4px; }',
      '.leaderboard-ui .gv-check + .gv-badges { margin-left: -8px; }',
      '.gv-dialog .gv-badge { vertical-align: -5px; }',
      '.leaderboard-ui > .container > button.main.gv-no-replay { cursor: default; }',
      '.leaderboard-ui > .container > button.main.gv-no-replay > .image-container { opacity: 0.4; }',
      '.leaderboard-ui > .container > button.main > .right > p.gv-replay-tag {',
      '  margin: 0; padding: 0 12px; font-size: 15px; opacity: 0.5; text-align: right; }',
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
      '.gv-dialog b.gv-no { color: #f55; }',
      '.gv-dialog .gv-check { width: 20px; height: 20px; margin: 0; vertical-align: -4px; }'
    ].join('\n');
    document.head.appendChild(css);
  }

  // The rank the game printed on a row, digits only: it draws the number and
  // its ordinal suffix into the same element.
  function positionOf(row) {
    var el = row.querySelector('.position');
    if (!el) return null;
    var n = parseInt(String(el.textContent || '').replace(/[^0-9]/g, ''), 10);
    return isFinite(n) ? n : null;
  }

  // Anonymous mode hides the player from everybody, including the player, who
  // is then left scanning a column of identical "Anonymous" for the run they
  // remember setting. Their own row, and only on their own screen, also
  // carries the name behind it.
  function nameSelfRow(row) {
    if (selfPosition == null || positionOf(row) !== selfPosition) return;
    var gv = identity();
    var shown = row.querySelector('.name');
    if (!gv || !shown) return;
    var real = gv.realName();
    if (!real || shown.textContent === real) return;
    var tag = document.createElement('span');
    tag.className = 'gv-realname';
    tag.textContent = '(' + real + ')';
    shown.parentNode.insertBefore(tag, shown.nextSibling);
  }

  var CHECK_SVG = '<svg class="gv-check" viewBox="0 0 24 24" role="img" aria-label="Verified">'
    + '<circle cx="12" cy="12" r="11" fill="#1d9bf0"/><path d="M7 12.5l3.2 3.2L17 9" fill="none"'
    + ' stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Straight after the name, ahead of anything else the row adds to it, so
  // the check reads as part of the name.
  function checkRow(row) {
    var shown = row.querySelector('.name');
    if (!shown || checked[positionOf(row)] !== true) return;
    shown.insertAdjacentHTML('afterend', CHECK_SVG);
  }

  // After the check, or the name when there is none.
  function badgeRow(row) {
    var shown = row.querySelector('.name');
    var key = owners[positionOf(row)];
    if (!shown || !key || !window.GV || !window.GV.badges) return;
    var check = shown.nextElementSibling;
    var after = check && check.classList.contains('gv-check') ? check : shown;
    after.parentNode.insertBefore(window.GV.badges.beside(key, 26), after.nextSibling);
  }

  // A time with no replay cannot be watched or raced, and picking one makes
  // the game fail the whole selection with "Failed to load recordings". The
  // row says so and does not take the pick. The player's own row is left
  // alone: the game plays that one from the copy it keeps itself.
  function markReplay(row) {
    var at = positionOf(row);
    if (replays[at] !== false || at === selfPosition) return;
    row.classList.add('gv-no-replay');
    row.title = 'No replay saved for this time';
    var right = row.querySelector('.right');
    if (right) {
      var tag = document.createElement('p');
      tag.className = 'gv-replay-tag';
      tag.textContent = 'No replay';
      right.appendChild(tag);
    }
    row.addEventListener('click', function (e) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }, true);
  }

  function labelRow(row) {
    if (row.dataset.gvLabelled) return;
    var state = row.querySelector('.verified-state');
    var left = row.querySelector('.left');
    if (!state || !left) return;
    row.dataset.gvLabelled = '1';
    nameSelfRow(row);
    checkRow(row);
    badgeRow(row);
    markReplay(row);

    var verified = state.classList.contains('verified');
    var label = document.createElement('p');
    label.className = 'gv-verify ' + (verified ? 'gv-yes' : 'gv-no');
    label.textContent = verified ? 'Signed in' : 'Guest';
    left.appendChild(label);
    state.title = verified
      ? 'Signed in - set while signed in to GameVault'
      : 'Guest - set without signing in';
  }

  // This week's badge, in gold, for the info box.
  function badgeSample() {
    var badges = window.GV && window.GV.badges;
    var day = new Date();
    day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
    return badges ? badges.svg({ badge: 'challenge-winner', starts: day.toISOString().slice(0, 10) }, 22) : '';
  }

  function showInfo() {
    var panel = document.querySelector('.leaderboard-ui');
    if (!panel || panel.querySelector('.gv-dialog')) return;
    var wrap = document.createElement('div');
    wrap.className = 'gv-dialog';
    var box = document.createElement('div');
    var text = document.createElement('p');
    text.innerHTML =
      '<b class="gv-yes">Signed in</b> means the time was set while signed in to ' +
      'GameVault, so it belongs to a known account.<br><br>' +
      '<b class="gv-no">Guest</b> means it was set without signing in. ' +
      'The run still counts and still appears here, but nothing proves who set ' +
      'it, so guest times are ranked below signed-in ones.<br><br>' +
      'Sign in before racing to have your times count as signed in.<br><br>' +
      CHECK_SVG + ' A blue check next to a name means GameVault has picked that ' +
      'player out as one of its top racers.<br><br>' +
      badgeSample() + ' Badges next to a name are Track of the Week wins. ' +
      'Every week has its own badge: gold for first, silver for second, bronze for third.<br><br>' +
      'No replay means the time was set before replays were saved, so it cannot ' +
      'be watched or raced. It gets one the next time that player beats it.';
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
    btn.title = 'What do these labels mean?';
    btn.setAttribute('aria-label', 'What do these labels mean?');
    btn.addEventListener('click', showInfo);
    panel.appendChild(btn);
  }

  // The game's filter at the foot of the board says "Only verified", which is
  // its word for signed in. Here that word now belongs to the blue check, so
  // the button says what it filters. Only written when it still needs it,
  // because this runs off an observer that would otherwise hear itself.
  function renameFilter(panel) {
    var button = panel.querySelector('.only-verified');
    var text = button && button.firstChild;
    if (!text || text.nodeType !== 3 || text.nodeValue !== 'Only verified') return;
    text.nodeValue = 'Only signed in';
  }

  function decorate() {
    var panel = document.querySelector('.leaderboard-ui');
    if (!panel) return;
    ensureStyles();
    ensureInfoButton(panel);
    renameFilter(panel);
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

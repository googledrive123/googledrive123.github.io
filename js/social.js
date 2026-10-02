/* GameVault chat and friends, the part that runs all the time.
   One poll every few seconds while someone is signed in: it tells friends
   which game is open (sql/social.sql), brings in new server, direct and group
   messages (chat/convos.sql), and pops the ones worth seeing up over the game.
   js/chat.js and js/friends.js draw on what it hands out.
   Public surface: window.GV.social. */
(function () {
  'use strict';

  var POLL_MS = 8000;
  // While chat is open a reply should show up about as fast as it is typed.
  var FAST_MS = 4000;

  var sb = null;
  var user = null;
  var host = {};
  var listeners = {};
  var me = { status: 'online', notify: true, mutes: {} };
  var counts = { unread: 0, requests: 0, server: false };
  var timer = null;
  var busy = false;
  var cursors = { server: null, convo: null };
  // Where the cursors stood when this page started. Anything at or under it
  // was there before the page was, and never pops up.
  var floors = { server: 0, convo: 0 };
  var seen = { server: {}, convo: {} };
  var fast = false;
  // What chat has on screen, so its own messages do not pop up over it.
  var viewing = null;

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { console.error('Social listener failed:', e); }
    });
  }

  // Every refusal from these functions is a sentence meant for the page,
  // P0001 with a wait=<seconds> or until=<time> hint where there is one.
  function rpc(name, args) {
    if (!sb) return Promise.reject(new Error('Sign in first.'));
    return sb.rpc(name, args || {}).then(function (res) {
      if (!res.error) return res.data;
      var error = new Error(res.error.code === 'P0001'
        ? res.error.message
        : 'Could not reach GameVault. Check your connection and try again.');
      error.code = res.error.code;
      error.hint = res.error.hint || '';
      throw error;
    });
  }

  function seenKey() {
    return 'gv.chat.server.' + (user ? user.id : '');
  }

  function serverSeen() {
    try { return Number(localStorage.getItem(seenKey())) || 0; } catch (e) { return 0; }
  }

  // The server room has no unread count of its own, only whether anything
  // came in since chat last showed it.
  function markServerSeen(id) {
    if (!id || id <= serverSeen()) return;
    try { localStorage.setItem(seenKey(), String(id)); } catch (e) {}
    if (counts.server) {
      counts.server = false;
      emit('counts', counts);
    }
  }

  function remember(kind, id) {
    seen[kind][id] = true;
    var ids = Object.keys(seen[kind]);
    if (ids.length > 600) ids.slice(0, ids.length - 500).forEach(function (old) { delete seen[kind][old]; });
  }

  function fresh(kind, list) {
    return (list || []).filter(function (m) {
      if (m.id <= floors[kind] || seen[kind][m.id]) return false;
      remember(kind, m.id);
      return true;
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (!sb) return;
    if (document.hidden) return;
    timer = setTimeout(poll, fast ? FAST_MS : POLL_MS);
  }

  function poll() {
    if (!sb || busy) return;
    busy = true;
    var first = cursors.server === null;
    rpc('gv_social_poll', {
      p_game: host.gameId ? host.gameId() : null,
      p_after_server: cursors.server,
      p_after_convo: cursors.convo
    }).then(function (data) {
      busy = false;
      if (!sb) return;
      if (first) {
        floors.server = Math.min(data.server_last, serverSeen() || data.server_last);
        floors.convo = data.convo_last;
      }
      var server = fresh('server', data.server);
      var convo = fresh('convo', data.convo);
      cursors.server = Math.max(cursors.server || 0, data.server_last);
      cursors.convo = Math.max(cursors.convo || 0, data.convo_last);

      counts.unread = data.unread;
      counts.requests = data.requests;
      counts.server = data.server_last > serverSeen() && viewing !== 'server';
      emit('counts', counts);
      if (server.length || convo.length) emit('messages', { server: server, convo: convo });
      schedule();
    }, function (error) {
      busy = false;
      // 42501 is the database answering as a guest: the session is gone.
      if (error.code === '42501') return stop();
      schedule();
    });
  }




  // Safe to call on every sign-in event: the same account carries on.
  // Without an account it only keeps the page's hooks, so chat can still
  // offer a guest the way to sign in.
  function start(client, account, hooks) {
    host = hooks || host;
    if (!client || !account) return stop();
    if (sb && user && user.id === account.id) {
      sb = client;
      user = account;
      return;
    }
    stop();
    sb = client;
    user = account;
    emit('state', user);
    poll();
  }

  // Signing out drops everything this account had on screen, which matters
  // on a shared computer.
  function stop() {
    clearTimeout(timer);
    timer = null;
    busy = false;
    cursors = { server: null, convo: null };
    floors = { server: 0, convo: 0 };
    seen = { server: {}, convo: {} };
    var was = !!sb;
    sb = null;
    user = null;
    me = { status: 'online', notify: true, mutes: {} };
    counts = { unread: 0, requests: 0, server: false };
    if (was) {
      emit('state', null);
      emit('counts', counts);
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (!sb) return;
    if (document.hidden) clearTimeout(timer);
    else if (!busy) poll();
  });

  window.GV = window.GV || {};
  window.GV.social = {
    start: start,
    stop: stop,
    on: on,
    rpc: rpc,
    client: function () { return sb; },
    user: function () { return user; },
    host: function () { return host; },
    counts: function () { return counts; },
    me: function () { return me; },
    markServerSeen: markServerSeen,
    // What chat shows, 'server' or 'convo:<id>', or null when it is shut.
    viewing: function (key) {
      viewing = key || null;
      var was = fast;
      fast = !!key;
      if (fast && !was && sb && !busy) poll();
    },
    // Asks again now, after sending or opening something.
    poke: function () {
      if (sb && !busy) poll();
    }
  };
}());

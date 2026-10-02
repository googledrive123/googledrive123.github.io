/* GameVault chat and friends, the part that runs all the time.
   One poll every few seconds while someone is signed in: it tells friends
   which game is open (sql/social.sql), brings in new server, direct and group
   messages (chat/convos.sql), and pops the ones worth seeing up over the game.
   js/chat.js and js/friends.js draw on what it hands out.
   Public surface: window.GV.social. */
(function () {
  'use strict';

  var POLL_MS = 8000;

  var sb = null;
  var user = null;
  var host = {};
  var listeners = {};
  var me = { status: 'online', notify: true, mutes: {} };
  var counts = { unread: 0, requests: 0, server: false };
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
  }

  // Signing out drops everything this account had on screen, which matters
  // on a shared computer.
  function stop() {
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
    },
    // Asks again now, after sending or opening something.
    poke: function () {
    }
  };
}());

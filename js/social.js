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
  var TOAST_MS = 6000;
  var TOASTS_MAX = 3;

  var sb = null;
  var user = null;
  var host = {};
  var listeners = {};
  var me = { status: 'online', notify: true, mutes: {} };
  // mentioned: @mentions not looked at yet, by chat; mentions: all of them.
  var counts = { unread: 0, requests: 0, server: false, mentioned: {}, mentions: 0 };
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
      counts.server = data.server_last > serverSeen() && viewing !== 'server' && !muted('server');
      setMentioned(data.mentioned || {});
      emit('counts', counts);
      if (server.length || convo.length) emit('messages', { server: server, convo: convo });
      server.forEach(function (m) { popUp('server', m); });
      convo.forEach(function (m) { popUp('convo:' + m.convo_id, m); });
      schedule();
    }, function (error) {
      busy = false;
      // 42501 is the database answering as a guest: the session is gone.
      if (error.code === '42501') return stop();
      schedule();
    });
  }

  function setMentioned(map) {
    counts.mentioned = map;
    counts.mentions = Object.keys(map).reduce(function (n, k) { return n + map[k]; }, 0);
  }

  function loadMe() {
    return rpc('gv_social_me').then(function (data) {
      me = data;
      emit('me', me);
      return me;
    });
  }

  // A mute holds until its time in epoch milliseconds, or for good at 0.
  function muted(key) {
    var until = me.mutes && me.mutes[key];
    if (until == null) return false;
    return until === 0 || until > Date.now();
  }

  // until: a time in epoch milliseconds, 0 for good, null to unmute.
  function mute(key, until) {
    return rpc('gv_mute_set', { p_key: key, p_until: until }).then(function (data) {
      me = data;
      emit('me', me);
      return me;
    });
  }

  function setStatus(status) {
    return rpc('gv_social_set', { p_status: status }).then(function (data) {
      me = data;
      emit('me', me);
      return me;
    });
  }

  function setNotify(on) {
    return rpc('gv_social_set', { p_notify: !!on }).then(function (data) {
      me = data;
      emit('me', me);
      return me;
    });
  }

  // ── Toasts ────────────────────────────────────────────────────────────
  // New messages pop up at the top of the game, never over the rest of the
  // site, where the chat button's count says enough.

  var CSS =
    '.gv-toasts{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:30;width:min(440px,calc(100% - 24px));display:flex;flex-direction:column;gap:8px;pointer-events:none}' +
    '.gv-toasts.gv-toasts-page{position:fixed;top:72px;z-index:2500}' +
    '.gv-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;padding:10px 10px 10px 14px;border-radius:12px;background:var(--surface,#121216);border:1px solid var(--border-strong,rgba(255,255,255,.16));border-left:3px solid var(--accent,#ff3b3b);box-shadow:0 14px 40px rgba(0,0,0,.55);color:var(--text,#f4f4f6);font:inherit;font-size:.85rem;line-height:1.4;cursor:pointer;animation:gvToastIn .22s cubic-bezier(.2,.8,.2,1)}' +
    '.gv-toast-text{flex:1;min-width:0}' +
    '.gv-toast-from{display:block;font-family:"JetBrains Mono",monospace;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted,#8a8a96);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.gv-toast-body{display:block;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}' +
    '.gv-toast-body b{font-weight:600}' +
    '.gv-toast-x{flex-shrink:0;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;border:0;background:transparent;color:var(--muted,#8a8a96);font:inherit;font-size:1rem;line-height:1;cursor:pointer}' +
    '.gv-toast-x:hover{color:var(--text,#f4f4f6);background:rgba(255,255,255,.06)}' +
    '.gv-toast.gv-toast-out{opacity:0;transform:translateY(-6px);transition:opacity .2s,transform .2s}' +
    '@keyframes gvToastIn{from{opacity:0;transform:translateY(-10px)}}' +
    '@media (prefers-reduced-motion:reduce){.gv-toast{animation:none}}';

  function style() {
    if (document.getElementById('gvSocialCss')) return;
    var st = document.createElement('style');
    st.id = 'gvSocialCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // Over the game when one is open, else at the top of the page.
  function layer(inGame) {
    style();
    var parent = inGame && host.gameArea ? host.gameArea() : document.body;
    var el = parent.querySelector(':scope > .gv-toasts');
    if (!el) {
      el = document.createElement('div');
      el.className = 'gv-toasts' + (parent === document.body ? ' gv-toasts-page' : '');
      el.setAttribute('aria-live', 'polite');
      parent.appendChild(el);
    }
    return el;
  }

  function dismiss(toast) {
    if (!toast.isConnected || toast.classList.contains('gv-toast-out')) return;
    toast.classList.add('gv-toast-out');
    setTimeout(function () { toast.remove(); }, 220);
  }

  // Clicking × hands the keys back to the game, which lost them to the click.
  function refocusGame() {
    var frame = host.frame && host.frame();
    try { if (frame && frame.contentWindow) frame.contentWindow.focus(); } catch (e) {}
  }

  function toast(from, who, text, onOpen, inGame) {
    var box = layer(inGame);
    var el = document.createElement('div');
    el.className = 'gv-toast';
    el.setAttribute('role', 'status');

    var words = document.createElement('div');
    words.className = 'gv-toast-text';
    var src = document.createElement('span');
    src.className = 'gv-toast-from';
    src.textContent = from;
    var body = document.createElement('span');
    body.className = 'gv-toast-body';
    if (who) {
      var name = document.createElement('b');
      name.textContent = who + ': ';
      body.appendChild(name);
    }
    body.appendChild(document.createTextNode(text));
    words.appendChild(src);
    words.appendChild(body);

    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'gv-toast-x';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '\u00d7';
    x.addEventListener('click', function (e) {
      e.stopPropagation();
      dismiss(el);
      if (inGame) refocusGame();
    });

    el.appendChild(words);
    el.appendChild(x);
    if (onOpen) {
      el.addEventListener('click', function () {
        dismiss(el);
        onOpen();
      });
    }
    box.appendChild(el);
    while (box.children.length > TOASTS_MAX) box.removeChild(box.firstElementChild);
    // Held while the pointer is on it, so it is not snatched mid-read.
    var left = TOAST_MS;
    var started = Date.now();
    var clock = setTimeout(function () { dismiss(el); }, left);
    el.addEventListener('mouseenter', function () {
      clearTimeout(clock);
      left -= Date.now() - started;
    });
    el.addEventListener('mouseleave', function () {
      started = Date.now();
      clock = setTimeout(function () { dismiss(el); }, Math.max(1500, left));
    });
    return el;
  }

  function popUp(key, m) {
    if (m.mine || !host.inGame || !host.inGame()) return;
    if (viewing === key) return;
    if (!me.notify || muted(key) || (m.user_id && muted('user:' + m.user_id))) return;
    var from = key === 'server' ? 'Server'
      : m.kind === 'group' ? (m.name || 'Group chat')
      : 'Direct message';
    var who = m.user_id ? m.username : '';
    toast(from, who, m.body, function () {
      if (window.GV && GV.chat) GV.chat.open({ key: key });
    }, true);
  }

  // A line from the site itself, like a friend's answer to an ask to join.
  function notice(text, onOpen) {
    var inGame = !!(host.inGame && host.inGame());
    return toast('GameVault', '', text, onOpen, inGame);
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
    loadMe().catch(function () {});
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
    counts = { unread: 0, requests: 0, server: false, mentioned: {}, mentions: 0 };
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
    muted: muted,
    mute: mute,
    setStatus: setStatus,
    setNotify: setNotify,
    notice: notice,
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

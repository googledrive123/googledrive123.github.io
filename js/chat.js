/* GameVault chat: the server room, direct messages and group chats in one
   window. Full screen on the home page, a small window over a game.
   New messages come in through js/social.js, which also keeps the mutes.
   Public surface: window.GV.chat. */
(function () {
  'use strict';

  var MAX = 300;
  var KEEP = 300;

  var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z"/></svg>';

  var CSS = [
    '.gv-chat{--gv-chat-side:260px;display:flex;background:var(--surface,#121216);color:var(--text,#f4f4f6);font-family:inherit;font-size:.9rem;overflow:hidden}',
    '.gv-chat[hidden]{display:none}',
    '.gv-chat-full{position:fixed;inset:0;z-index:1900;padding:16px;background:rgba(8,8,10,.92)}',
    '.gv-chat-full>.gv-chat-frame{width:min(1100px,100%);margin:0 auto;border:1px solid var(--border-strong,rgba(255,255,255,.16));border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.6)}',
    '.gv-chat-frame{position:relative;display:flex;flex:1;min-width:0;background:var(--surface,#121216);overflow:hidden}',
    '.gv-chat-side{width:var(--gv-chat-side);flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--border,rgba(255,255,255,.07));background:var(--bg,#08080a)}',
    '.gv-chat-side-head{display:flex;align-items:center;gap:6px;padding:12px 12px 8px 16px;font-weight:600}',
    '.gv-chat-side-head>span{flex:1}',
    '.gv-chat-list{flex:1;overflow-y:auto;padding:4px 8px}',
    '.gv-chat-row{width:100%;display:flex;align-items:center;gap:10px;padding:8px;border:0;border-radius:10px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}',
    '.gv-chat-row:hover{background:var(--surface-2,#1a1a20)}',
    '.gv-chat-row[aria-current="true"]{background:var(--surface-2,#1a1a20)}',
    '.gv-chat-dot{width:30px;height:30px;flex-shrink:0;border-radius:50%;display:grid;place-items:center;background:var(--surface-2,#1a1a20);border:1px solid var(--border-strong,rgba(255,255,255,.16));font-size:.7rem;font-weight:700;overflow:hidden}',
    '.gv-chat-row-text{flex:1;min-width:0}',
    '.gv-chat-row-name,.gv-chat-row-last{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.gv-chat-row-name{font-weight:600;font-size:.85rem}',
    '.gv-chat-row-last{font-size:.75rem;color:var(--muted,#8a8a96)}',
    '.gv-chat-count{min-width:18px;height:18px;padding:0 5px;border-radius:100px;background:var(--accent,#ff3b3b);color:#fff;font-size:.65rem;font-weight:700;display:grid;place-items:center}',
    '.gv-chat-count[hidden]{display:none}',
    '.gv-chat-muted{color:var(--muted-2,#54545e);font-size:.7rem}',
    '.gv-chat-foot{padding:8px 12px 12px;border-top:1px solid var(--border,rgba(255,255,255,.07));display:flex;gap:6px}',
    '.gv-chat-main{flex:1;min-width:0;display:flex;flex-direction:column}',
    '.gv-chat-head{display:flex;align-items:center;gap:6px;padding:10px 10px 10px 16px;border-bottom:1px solid var(--border,rgba(255,255,255,.07))}',
    '.gv-chat-title{flex:1;min-width:0}',
    '.gv-chat-title b,.gv-chat-title small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.gv-chat-title small{font-size:.72rem;color:var(--muted,#8a8a96);font-weight:400}',
    '.gv-chat-icon{width:32px;height:32px;flex-shrink:0;display:grid;place-items:center;border-radius:50%;border:1px solid var(--border,rgba(255,255,255,.07));background:transparent;color:var(--muted,#8a8a96);font:inherit;font-size:1rem;line-height:1;cursor:pointer}',
    '.gv-chat-icon:hover{color:var(--text,#f4f4f6);border-color:var(--border-strong,rgba(255,255,255,.16))}',
    '.gv-chat-icon[hidden]{display:none}',
    '.gv-chat-icon.on{color:var(--accent,#ff3b3b)}',
    '.gv-chat-log{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:8px 10px;display:flex;flex-direction:column;gap:2px}',
    '.gv-chat-log>.gv-msg:first-child{margin-top:auto}',
    '.gv-chat-empty{margin:auto;color:var(--muted-2,#54545e);font-size:.85rem;text-align:center;padding:24px}',
    '.gv-msg{padding:6px 8px;border-radius:10px}',
    '.gv-msg:hover{background:rgba(255,255,255,.025)}',
    '.gv-msg-head{display:flex;align-items:baseline;gap:8px;min-width:0}',
    '.gv-msg-name{padding:0;border:0;background:none;color:inherit;font:inherit;font-size:.84rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}',
    '.gv-msg-name:hover{text-decoration:underline}',
    '.gv-msg.mine .gv-msg-name{color:var(--accent,#ff3b3b);cursor:default;text-decoration:none}',
    '.gv-msg-time{font-family:"JetBrains Mono",monospace;font-size:.64rem;color:var(--muted-2,#54545e);white-space:nowrap}',
    '.gv-msg-body{margin-top:1px;line-height:1.5;color:#d8d8de;overflow-wrap:anywhere}',
    '.gv-msg-site{align-self:center;padding:4px 10px;font-size:.75rem;color:var(--muted,#8a8a96)}',
    '.gv-chat-pill{padding:4px 11px;border-radius:100px;border:1px solid var(--border-strong,rgba(255,255,255,.16));background:transparent;color:var(--text,#f4f4f6);font:inherit;font-size:.75rem;cursor:pointer}',
    '.gv-chat-pill:hover{border-color:var(--accent,#ff3b3b)}',
    '.gv-chat-pill:disabled{opacity:.45;cursor:default}',
    '.gv-chat-pill.primary{background:var(--text,#f4f4f6);color:var(--bg,#08080a);border-color:transparent;font-weight:700}',
    '.gv-chat-pill.danger{color:var(--accent,#ff3b3b);border-color:rgba(255,59,59,.35)}',
    '.gv-chat-form{display:flex;gap:8px;padding:10px 12px 4px;border-top:1px solid var(--border,rgba(255,255,255,.07))}',
    '.gv-chat-box{position:relative;flex:1;min-width:0}',
    '.gv-chat-input{width:100%;box-sizing:border-box;padding:9px 56px 9px 12px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.07));background:var(--surface-2,#1a1a20);color:var(--text,#f4f4f6);font:inherit;font-size:.88rem;outline:none}',
    '.gv-chat-input:focus{border-color:var(--accent,#ff3b3b)}',
    '.gv-chat-len{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-family:"JetBrains Mono",monospace;font-size:.62rem;color:var(--muted-2,#54545e);pointer-events:none}',
    '.gv-chat-send{min-width:64px}',
    '.gv-chat-status{min-height:1.2rem;padding:2px 12px 8px;font-size:.76rem;color:var(--muted,#8a8a96)}',
    '.gv-chat-status.wait{color:#f0c04a}',
    '.gv-chat-status.error{color:#ff7a7a}',
    '.gv-chat-sheet{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;background:var(--surface,#121216)}',
    '.gv-chat-sheet[hidden]{display:none}',
    '.gv-chat-sheet-body{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:10px}',
    '.gv-chat-sheet-body p{margin:0;color:var(--muted,#8a8a96);font-size:.8rem;line-height:1.5}',
    '.gv-chat-field{width:100%;box-sizing:border-box;padding:8px 12px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.07));background:var(--surface-2,#1a1a20);color:var(--text,#f4f4f6);font:inherit;font-size:.85rem;outline:none}',
    '.gv-chat-field:focus{border-color:var(--accent,#ff3b3b)}',
    '.gv-chat-people{display:flex;flex-direction:column;gap:2px}',
    '.gv-chat-person{display:flex;align-items:center;gap:10px;padding:6px 4px}',
    '.gv-chat-person>span:not(.gv-chat-dot){flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.gv-chat-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.gv-chat-chips:empty{display:none}',
    '.gv-chat-actions{display:flex;flex-wrap:wrap;gap:8px}',
    '.gv-chat-btn{position:relative;flex-shrink:0;width:38px;height:38px;display:grid;place-items:center;border-radius:50%;border:1px solid var(--border,rgba(255,255,255,.07));background:transparent;color:var(--muted,#8a8a96);cursor:pointer;transition:color .15s,border-color .15s}',
    '.gv-chat-btn:hover,.gv-chat-btn[aria-expanded="true"]{color:var(--text,#f4f4f6);border-color:var(--border-strong,rgba(255,255,255,.16))}',
    '.gv-chat-btn.pill{width:auto;height:auto;display:inline-flex;gap:6px;padding:.35rem .85rem;border-radius:100px;font:inherit;font-size:.78rem;white-space:nowrap}',
    '.gv-chat-badge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:100px;background:var(--accent,#ff3b3b);color:#fff;font-size:.6rem;font-weight:700;line-height:16px;text-align:center}',
    '.gv-chat-badge.dot{min-width:9px;width:9px;height:9px;padding:0;top:-1px;right:-1px}',
    '.gv-chat-badge[hidden]{display:none}',
    '.gv-chat-window{position:absolute;top:12px;right:12px;z-index:20;width:min(380px,calc(100% - 24px));height:min(520px,calc(100% - 24px));border:1px solid var(--border-strong,rgba(255,255,255,.16));border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.6)}',
    '.gv-chat-narrow .gv-chat-side{width:100%;border-right:0}',
    '.gv-chat-narrow:not(.gv-chat-in) .gv-chat-main,.gv-chat-narrow.gv-chat-in .gv-chat-side{display:none}',
    '.gv-chat-back{display:none}',
    '.gv-chat-narrow .gv-chat-back{display:grid}',
    '@media (max-width:700px){.gv-chat-full{padding:0}.gv-chat-full>.gv-chat-frame{border-radius:0;border:0}}'
  ].join('');

  var root = null;
  var els = {};
  var mode = null;
  var current = 'server';
  var convos = [];
  // Messages already fetched, by conversation: 'server' or 'convo:<id>'.
  var threads = {};
  var sending = false;
  var waitUntil = 0;
  var waitTimer = null;
  var buttons = [];
  var listTimer = null;
  var readTimer = null;

  function social() {
    return window.GV && window.GV.social;
  }

  function signedIn() {
    return !!(social() && social().user());
  }

  function host() {
    return (social() && social().host()) || {};
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function pill(label, cls, onClick) {
    var b = el('button', 'gv-chat-pill' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function iconButton(label, html, onClick) {
    var b = el('button', 'gv-chat-icon');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.innerHTML = html;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function when(iso) {
    var d = new Date(iso);
    var t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return t;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + t;
  }

  function initials(name) {
    return (name || '?').split(/[\s_]+/).map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
  }

  function style() {
    if (document.getElementById('gvChatCss')) return;
    var st = document.createElement('style');
    st.id = 'gvChatCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ── The window ────────────────────────────────────────────────────────

  function build() {
    if (root) return;
    style();
    root = el('div', 'gv-chat');
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Chat');

    var frame = el('div', 'gv-chat-frame');
    var side = el('aside', 'gv-chat-side');
    var sideHead = el('div', 'gv-chat-side-head');
    sideHead.appendChild(el('span', '', 'Chats'));
    els.sideClose = iconButton('Close chat', '\u00d7', close);
    els.sideClose.classList.add('gv-chat-close');
    sideHead.appendChild(els.sideClose);
    els.list = el('div', 'gv-chat-list');
    side.appendChild(sideHead);
    side.appendChild(els.list);

    var main = el('section', 'gv-chat-main');
    var head = el('div', 'gv-chat-head');
    var back = iconButton('All chats', '\u2190', function () { root.classList.remove('gv-chat-in'); });
    back.classList.add('gv-chat-back');
    head.appendChild(back);
    var title = el('div', 'gv-chat-title');
    els.title = el('b');
    els.sub = el('small');
    title.appendChild(els.title);
    title.appendChild(els.sub);
    head.appendChild(title);
    var shut = iconButton('Close chat', '\u00d7', close);
    shut.classList.add('gv-chat-close');
    head.appendChild(shut);

    els.log = el('div', 'gv-chat-log');
    els.log.setAttribute('role', 'log');
    els.log.setAttribute('aria-live', 'polite');

    var form = el('form', 'gv-chat-form');
    form.autocomplete = 'off';
    var box = el('div', 'gv-chat-box');
    els.input = el('input', 'gv-chat-input');
    els.input.maxLength = MAX;
    els.input.setAttribute('aria-label', 'Message');
    els.input.setAttribute('enterkeyhint', 'send');
    els.len = el('span', 'gv-chat-len', '0/' + MAX);
    box.appendChild(els.input);
    box.appendChild(els.len);
    els.send = pill('Send', 'primary gv-chat-send');
    els.send.type = 'submit';
    form.appendChild(box);
    form.appendChild(els.send);
    els.status = el('div', 'gv-chat-status');
    els.status.setAttribute('aria-live', 'polite');

    main.appendChild(head);
    main.appendChild(els.log);
    main.appendChild(form);
    main.appendChild(els.status);

    els.sheet = el('div', 'gv-chat-sheet');
    els.sheet.hidden = true;

    frame.appendChild(side);
    frame.appendChild(main);
    frame.appendChild(els.sheet);
    root.appendChild(frame);
    els.frame = frame;
    els.side = side;
    els.main = main;

    els.input.addEventListener('input', paintLength);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      sendMessage();
    });
    root.addEventListener('click', function (e) {
      if (e.target === root) close();
    });
  }

  function say(text, kind) {
    els.status.textContent = text || '';
    els.status.className = 'gv-chat-status' + (kind ? ' ' + kind : '');
    els.status.dataset.kind = kind || '';
  }

  function paintLength() {
    els.len.textContent = els.input.value.length + '/' + MAX;
  }

  function isOpen() {
    return !!(root && !root.hidden);
  }

  function open(opts) {
    opts = opts || {};
    build();
    var inGame = !!(host().inGame && host().inGame());
    mode = inGame ? 'window' : 'full';
    var parent = mode === 'window' && host().gameArea ? host().gameArea() : document.body;
    if (root.parentNode !== parent) parent.appendChild(root);
    root.classList.toggle('gv-chat-window', mode === 'window');
    root.classList.toggle('gv-chat-narrow', mode === 'window' || innerWidth <= 700);
    root.classList.toggle('gv-chat-full', mode === 'full');
    root.hidden = false;
    els.sideClose.hidden = mode !== 'window' && !root.classList.contains('gv-chat-narrow');
    refreshList();
    view(opts.key || current, !!opts.key || mode !== 'window');
    paintButtons();
  }

  function close() {
    if (!isOpen()) return;
    var wasWindow = mode === 'window';
    root.hidden = true;
    closeSheet();
    mode = null;
    if (social()) social().viewing(null);
    paintButtons();
    if (wasWindow) {
      var frame = host().frame && host().frame();
      try { if (frame && frame.contentWindow) frame.contentWindow.focus(); } catch (e) {}
    }
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  // ── Conversations ─────────────────────────────────────────────────────

  function thread(key) {
    return threads[key] || (threads[key] = { list: [], ids: {}, last: 0, loaded: false });
  }

  function convoFor(key) {
    var id = Number(String(key).split(':')[1]);
    for (var i = 0; i < convos.length; i++) if (convos[i].id === id) return convos[i];
    return null;
  }

  function convoName(c) {
    if (!c) return 'Chat';
    var names = (c.members || []).map(function (m) { return m.username; });
    if (c.kind === 'group') return c.name || names.join(', ') || 'Just you';
    return names[0] || 'Nobody';
  }

  function titleFor(key) {
    if (key === 'server') return { name: 'Server', sub: 'Everyone on GameVault' };
    var c = convoFor(key);
    if (!c) return { name: 'Chat', sub: '' };
    if (c.kind === 'group') {
      var count = (c.members || []).length + 1;
      return { name: convoName(c), sub: count + ' people' };
    }
    return { name: convoName(c), sub: 'Direct message' };
  }

  function paintHead() {
    var t = titleFor(current);
    els.title.textContent = t.name;
    els.sub.textContent = t.sub;
  }

  function view(key, enter) {
    current = key;
    say('');
    closeSheet();
    paintHead();
    root.classList.toggle('gv-chat-in', !!enter);
    social().viewing(key);
    var t = thread(key);
    els.log.textContent = '';
    if (t.loaded) t.list.forEach(function (m) { els.log.appendChild(render(m)); });
    else els.log.appendChild(el('div', 'gv-chat-empty', 'Loading\u2026'));
    toBottom();
    load(key);
    markRead(key);
    paintList();
    if (enter) els.input.focus();
  }

  // The whole window again each time a conversation is opened, so anything
  // the owner took down since is gone from it.
  function load(key) {
    var req = key === 'server'
      ? social().rpc('gv_chat_recent', { p_after_id: 0 })
      : social().rpc('gv_convo_recent', { p_convo: Number(key.split(':')[1]), p_after_id: 0 });
    req.then(function (list) {
      var t = thread(key);
      t.list = [];
      t.ids = {};
      t.last = 0;
      t.loaded = true;
      add(key, list || [], true);
      if (key === current && isOpen()) {
        els.log.textContent = '';
        t.list.forEach(function (m) { els.log.appendChild(render(m)); });
        if (!t.list.length) els.log.appendChild(el('div', 'gv-chat-empty', 'No messages yet. Say hi.'));
        toBottom();
        markRead(key);
      }
    }, function (error) {
      if (key === current && isOpen()) say(error.message, 'error');
    });
  }

  // Keeps each conversation in id order without repeats, and draws what is
  // new if it is the one on screen.
  function add(key, list, quiet) {
    var t = thread(key);
    var showing = !quiet && key === current && isOpen();
    var follow = showing && nearBottom();
    list.forEach(function (m) {
      if (t.ids[m.id]) return;
      t.ids[m.id] = true;
      if (m.id > t.last) t.last = m.id;
      var at = t.list.length;
      while (at > 0 && t.list[at - 1].id > m.id) at--;
      t.list.splice(at, 0, m);
      if (showing) {
        var empty = els.log.querySelector('.gv-chat-empty');
        if (empty) empty.remove();
        var node = render(m);
        var next = els.log.children[at] || null;
        els.log.insertBefore(node, next);
      }
    });
    while (t.list.length > KEEP) {
      delete t.ids[t.list.shift().id];
      if (showing && els.log.firstElementChild) els.log.removeChild(els.log.firstElementChild);
    }
    if (showing && (follow || list.some(function (m) { return m.mine; }))) toBottom();
  }

  function nearBottom() {
    return els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 80;
  }

  function toBottom() {
    els.log.scrollTop = els.log.scrollHeight;
  }

  function markRead(key) {
    var t = thread(key);
    if (!isOpen() || key !== current || !t.last) return;
    if (key === 'server') return social().markServerSeen(t.last);
    var c = convoFor(key);
    if (c) c.unread = 0;
    clearTimeout(readTimer);
    readTimer = setTimeout(function () {
      social().rpc('gv_convo_read', { p_convo: Number(key.split(':')[1]), p_id: t.last })
        .then(function () { social().poke(); }, function () {});
    }, 400);
  }

  function render(m) {
    if (!m.user_id) return el('div', 'gv-msg-site', m.body);
    var row = el('div', 'gv-msg' + (m.mine ? ' mine' : ''));
    row.dataset.id = m.id;
    var head = el('div', 'gv-msg-head');
    var name = el('button', 'gv-msg-name', m.username);
    name.type = 'button';
    var time = el('time', 'gv-msg-time', when(m.created_at));
    time.dateTime = m.created_at;
    head.appendChild(name);
    head.appendChild(time);
    row.appendChild(head);
    row.appendChild(el('div', 'gv-msg-body', m.body));
    return row;
  }

  // ── Sending ───────────────────────────────────────────────────────────

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function paintSend() {
    var left = Math.ceil((waitUntil - Date.now()) / 1000);
    if (left > 0) {
      els.send.disabled = true;
      els.send.textContent = left >= 60 ? Math.floor(left / 60) + ':' + pad(left % 60) : left + 's';
      return;
    }
    clearInterval(waitTimer);
    waitTimer = null;
    els.send.textContent = 'Send';
    els.send.disabled = sending;
    if (els.status.dataset.kind === 'wait') say('');
  }

  // The server holds the real limits. Waiting here as well means a normal
  // chatter never meets them.
  function cooldown(secs) {
    waitUntil = Date.now() + secs * 1000;
    clearInterval(waitTimer);
    waitTimer = setInterval(paintSend, 250);
    paintSend();
  }

  function failed(error) {
    var wait = /wait=(\d+)/.exec(error.hint || '');
    var until = /until=(\S+)/.exec(error.hint || '');
    if (wait) {
      say(error.message, 'wait');
      cooldown(Number(wait[1]));
    } else if (until) {
      say(error.message + ' Try again after ' + when(until[1]) + '.', 'error');
    } else {
      say(error.message, 'error');
    }
  }

  function sendMessage() {
    if (sending || waitTimer) return;
    var text = els.input.value.trim();
    if (!text) return say('Write something first.', 'wait');
    var key = current;
    sending = true;
    els.send.disabled = true;
    var req = key === 'server'
      ? social().rpc('gv_chat_send', { p_body: text })
      : social().rpc('gv_convo_send', { p_convo: Number(key.split(':')[1]), p_body: text });
    req.then(function (m) {
      sending = false;
      els.input.value = '';
      paintLength();
      say('');
      add(key, [m]);
      markRead(key);
      cooldown(key === 'server' ? 5 : 1);
      social().poke();
    }, function (error) {
      sending = false;
      failed(error);
      paintSend();
    });
  }

  // ── The list ──────────────────────────────────────────────────────────

  function refreshList() {
    return social().rpc('gv_convo_list').then(function (list) {
      convos = list || [];
      paintList();
      if (isOpen()) paintHead();
    }, function () {});
  }

  // Many messages at once only ask for the list once.
  function soonList() {
    clearTimeout(listTimer);
    listTimer = setTimeout(refreshList, 500);
  }

  function row(key, name, last, unread, dot) {
    var b = el('button', 'gv-chat-row');
    b.type = 'button';
    var on = key === current && (mode === 'full' || root.classList.contains('gv-chat-in'));
    b.setAttribute('aria-current', on ? 'true' : 'false');
    var face = el('span', 'gv-chat-dot', dot || initials(name));
    var words = el('span', 'gv-chat-row-text');
    words.appendChild(el('span', 'gv-chat-row-name', name));
    words.appendChild(el('span', 'gv-chat-row-last', last || ''));
    b.appendChild(face);
    b.appendChild(words);
    var count = el('span', 'gv-chat-count', unread === true ? '' : String(unread || ''));
    count.hidden = !unread;
    if (unread === true) count.style.cssText = 'min-width:9px;width:9px;height:9px;padding:0';
    b.appendChild(count);
    b.addEventListener('click', function () { view(key, true); });
    return b;
  }

  function lastLine(m) {
    if (!m) return '';
    if (!m.username) return m.body;
    return (m.mine ? 'You' : m.username) + ': ' + m.body;
  }

  function paintList() {
    if (!root) return;
    els.list.textContent = '';
    var server = thread('server');
    var lastServer = server.list[server.list.length - 1];
    els.list.appendChild(row('server', 'Server', lastServer ? lastLine(lastServer) : 'Everyone on GameVault',
      social().counts().server, '#'));
    convos.forEach(function (c) {
      els.list.appendChild(row('convo:' + c.id, convoName(c), lastLine(c.last), c.unread));
    });
  }

  // ── The chat button ───────────────────────────────────────────────────

  // pill: the game bar's style, with a label, rather than a round icon.
  function mount(container, opts) {
    if (!container || container.querySelector('.gv-chat-btn')) return;
    style();
    var b = el('button', 'gv-chat-btn' + (opts && opts.pill ? ' pill' : ''));
    b.type = 'button';
    b.setAttribute('aria-label', 'Chat');
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = ICON + (opts && opts.pill ? '<span>Chat</span>' : '');
    var badge = el('span', 'gv-chat-badge');
    badge.hidden = true;
    b.appendChild(badge);
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });
    container.appendChild(b);
    buttons.push({ button: b, badge: badge });
    paintButtons();
  }

  function paintButtons() {
    var counts = (social() && social().counts()) || {};
    buttons.forEach(function (x) {
      x.badge.hidden = !(counts.unread || counts.server);
      x.badge.classList.toggle('dot', !counts.unread && !!counts.server);
      x.badge.textContent = counts.unread ? (counts.unread > 99 ? '99+' : String(counts.unread)) : '';
      x.button.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
      x.button.setAttribute('aria-label', counts.unread ? 'Chat, ' + counts.unread + ' unread' : 'Chat');
    });
  }


  function closeSheet() {
  }









  // ── Wiring ────────────────────────────────────────────────────────────

  // Escape closes what is open in chat first, and never reaches the game
  // page's own Escape, which would close the game.
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !isOpen()) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (els.sheet && !els.sheet.hidden) closeSheet();
    else close();
  }, true);

  function wire() {
    var s = social();
    if (!s) return;
    s.on('messages', function (data) {
      if (data.server.length) add('server', data.server);
      var known = true;
      data.convo.forEach(function (m) {
        if (!convoFor('convo:' + m.convo_id)) known = false;
        if (thread('convo:' + m.convo_id).loaded) add('convo:' + m.convo_id, [m]);
      });
      if (isOpen()) markRead(current);
      if (isOpen() || !known) soonList();
    });
    s.on('counts', function () {
      paintButtons();
      if (isOpen()) paintList();
    });
    s.on('me', function () {
      if (!isOpen()) return;
      paintHead();
    });
    // Signed out, or someone else signed in: nothing of theirs stays.
    s.on('state', function () {
      close();
      threads = {};
      convos = [];
      current = 'server';
    });
  }

  window.GV = window.GV || {};
  window.GV.chat = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    mount: mount,
    // For the game page closing its game: a window over it goes with it.
    closeWindow: function () { if (mode === 'window') close(); }
  };

  if (window.GV.social) wire();
  else document.addEventListener('DOMContentLoaded', wire);
}());

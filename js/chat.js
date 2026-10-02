/* GameVault chat: the server room, direct messages and group chats in one
   window. Full screen on the home page, a small window over a game.
   New messages come in through js/social.js, which also keeps the mutes.
   Public surface: window.GV.chat. */
(function () {
  'use strict';

  var MAX = 300;
  var KEEP = 300;
  var REASONS = ['Mean', 'Rude', 'Personal info', 'Spam'];
  var MUTES = [
    { label: 'For 30 minutes', ms: 30 * 60 * 1000 },
    { label: 'For 1 hour', ms: 60 * 60 * 1000 },
    { label: 'Until I turn it back on', ms: 0 }
  ];

  var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z"/></svg>';
  // The blue check from analytics/verified.sql, as the rest of the site draws it.
  var CHECK = '<svg class="gv-chat-check" viewBox="0 0 24 24" role="img" aria-label="Verified"><circle cx="12" cy="12" r="11" fill="#1d9bf0"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
    '.gv-msg-report{margin-left:auto;padding:1px 6px;border:0;border-radius:6px;background:none;color:var(--muted-2,#54545e);font:inherit;font-size:.7rem;cursor:pointer;opacity:0;transition:opacity .15s}',
    '.gv-msg:hover .gv-msg-report,.gv-msg-report:focus-visible,.gv-msg.reporting .gv-msg-report{opacity:1}',
    '.gv-msg-report:hover{color:var(--text,#f4f4f6)}',
    '.gv-msg-report:disabled{opacity:1;cursor:default}',
    '@media (hover:none){.gv-msg-report{opacity:1}}',
    '.gv-msg-flag{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px;font-size:.75rem;color:var(--muted,#8a8a96)}',
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
    '.gv-chat-check{width:14px;height:14px;flex-shrink:0;margin-left:4px;vertical-align:-2px}',
    '.gv-mention{display:inline;padding:0 3px;border:0;border-radius:4px;background:rgba(57,135,229,.18);color:#8ab8f2;font:inherit;font-weight:600;cursor:pointer}',
    '.gv-mention:hover{text-decoration:underline}',
    '.gv-mention.me{background:rgba(255,59,59,.3);color:#fff;cursor:default;text-decoration:none}',
    '.gv-msg.mentioned{background:rgba(255,59,59,.07);box-shadow:inset 3px 0 0 var(--accent,#ff3b3b)}',
    '.gv-chat-at{min-width:18px;height:18px;padding:0 5px;border-radius:100px;background:var(--accent,#ff3b3b);color:#fff;font-size:.68rem;font-weight:800;display:grid;place-items:center}',
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
    '.gv-chat-guest{margin:auto;max-width:340px;padding:24px;border-radius:16px;background:var(--surface,#121216);border:1px solid var(--border-strong,rgba(255,255,255,.16));text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center;color:var(--muted,#8a8a96);line-height:1.5}',
    '.gv-chat-guest[hidden],.gv-chat-frame[hidden]{display:none}',
    '.gv-chat-guest p{margin:0}',
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
    '.gv-chat-inline{height:clamp(420px,calc(100vh - 260px),760px);border:1px solid var(--border-strong,rgba(255,255,255,.16));border-radius:18px}',
    '.gv-chat-inline .gv-chat-close{display:none}',
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
    els.notify = iconButton('Pop-ups over games', '', toggleNotify);
    sideHead.appendChild(els.notify);
    els.sideClose = iconButton('Close chat', '\u00d7', close);
    els.sideClose.classList.add('gv-chat-close');
    sideHead.appendChild(els.sideClose);
    els.list = el('div', 'gv-chat-list');
    side.appendChild(sideHead);
    side.appendChild(els.list);
    var foot = el('div', 'gv-chat-foot');
    foot.appendChild(pill('Compose', 'primary', function () { compose('dm'); }));
    foot.appendChild(pill('Group chat', '', function () { compose('group'); }));
    side.appendChild(foot);

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
    els.mute = iconButton('Mute', '', function () { muteSheet(current, els.title.textContent); });
    head.appendChild(els.mute);
    els.members = iconButton('People', '\u2630', membersSheet);
    head.appendChild(els.members);
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
    // A page of its own for chat (/chat/) holds it in its layout instead.
    if (opts.into) {
      mode = 'inline';
      parent = opts.into;
    }
    if (root.parentNode !== parent) parent.appendChild(root);
    root.classList.toggle('gv-chat-window', mode === 'window');
    root.classList.toggle('gv-chat-inline', mode === 'inline');
    root.classList.toggle('gv-chat-narrow', mode === 'window' || parent.clientWidth <= 700);
    root.classList.toggle('gv-chat-full', mode === 'full');
    root.hidden = false;
    els.sideClose.hidden = mode !== 'window' && !root.classList.contains('gv-chat-narrow');
    if (!signedIn()) return showGuest();
    hideGuest();
    refreshList();
    view(opts.key || current, !!opts.key || mode !== 'window');
    paintButtons();
    paintNotify();
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
    var other = (c.members || [])[0];
    return { name: convoName(c), sub: 'Direct message', verified: !!(other && other.verified) };
  }

  function paintHead() {
    var t = titleFor(current);
    els.title.textContent = t.name;
    if (t.verified) els.title.appendChild(check());
    els.sub.textContent = t.sub;
    var c = current === 'server' ? null : convoFor(current);
    els.members.hidden = !(c && c.kind === 'group');
    var on = social().muted(current);
    els.mute.innerHTML = on ? BELL_OFF : BELL;
    els.mute.classList.toggle('on', on);
    els.mute.title = on ? 'Muted. Click to change' : 'Mute';
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
    var row = el('div', 'gv-msg' + (m.mine ? ' mine' : '') + (mentionsMe(m) ? ' mentioned' : ''));
    row.dataset.id = m.id;
    var head = el('div', 'gv-msg-head');
    var name = el('button', 'gv-msg-name', m.username);
    name.type = 'button';
    if (!m.mine) name.addEventListener('click', function () { personSheet(m.user_id, m.username); });
    var time = el('time', 'gv-msg-time', when(m.created_at));
    time.dateTime = m.created_at;
    head.appendChild(name);
    if (m.verified) head.appendChild(check());
    head.appendChild(time);
    if (!m.mine) {
      var flag = el('button', 'gv-msg-report', 'Report');
      flag.type = 'button';
      flag.addEventListener('click', function () { openReport(row, m, flag); });
      head.appendChild(flag);
    }
    row.appendChild(head);
    row.appendChild(bodyNode(m));
    return row;
  }

  function check() {
    var box = el('span');
    box.innerHTML = CHECK;
    return box.firstChild;
  }

  // The text, with each @name the message named picked out. A click on one
  // opens that person, as a click on a name does.
  function bodyNode(m) {
    var body = el('div', 'gv-msg-body');
    var named = (m.mentions || []).slice().sort(function (a, b) { return b.name.length - a.name.length; });
    var text = m.body, lower = text.toLowerCase(), from = 0, i = 0;
    var me = myId();
    while (named.length) {
      var at = lower.indexOf('@', i);
      if (at < 0) break;
      var hit = null;
      for (var k = 0; k < named.length && !hit; k++) {
        if (lower.substr(at + 1, named[k].name.length) === named[k].name.toLowerCase()) hit = named[k];
      }
      i = at + 1;
      if (!hit) continue;
      if (at > from) body.appendChild(document.createTextNode(text.slice(from, at)));
      var tag = el('button', 'gv-mention' + (hit.id === me ? ' me' : ''), text.substr(at, hit.name.length + 1));
      tag.type = 'button';
      if (hit.id !== me) tag.addEventListener('click', personSheet.bind(null, hit.id, hit.name));
      body.appendChild(tag);
      from = i = at + 1 + hit.name.length;
    }
    if (from < text.length) body.appendChild(document.createTextNode(text.slice(from)));
    return body;
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

  function myId() {
    var u = social() && social().user();
    return u ? u.id : null;
  }

  function mentionsMe(m) {
    var me = myId();
    return !!(me && !m.mine && (m.mentions || []).some(function (x) { return x.id === me; }));
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

  function row(key, name, last, unread, dot, verified) {
    var b = el('button', 'gv-chat-row');
    b.type = 'button';
    var on = key === current && (mode === 'full' || root.classList.contains('gv-chat-in'));
    b.setAttribute('aria-current', on ? 'true' : 'false');
    var face = el('span', 'gv-chat-dot', dot || initials(name));
    var words = el('span', 'gv-chat-row-text');
    var title = el('span', 'gv-chat-row-name', name);
    if (verified) title.appendChild(check());
    words.appendChild(title);
    words.appendChild(el('span', 'gv-chat-row-last', last || ''));
    b.appendChild(face);
    b.appendChild(words);
    if (social().muted(key)) b.appendChild(el('span', 'gv-chat-muted', 'muted'));
    // Someone named this account here and it has not looked yet.
    var named = (social().counts().mentioned || {})[key];
    if (named) {
      var at = el('span', 'gv-chat-at', '@');
      at.title = named === 1 ? 'You were mentioned' : 'You were mentioned ' + named + ' times';
      b.appendChild(at);
    }
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
      var other = c.kind === 'dm' && (c.members || [])[0];
      els.list.appendChild(row('convo:' + c.id, convoName(c), lastLine(c.last), c.unread, null, !!(other && other.verified)));
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
    var named = counts.mentions || 0;
    buttons.forEach(function (x) {
      x.badge.hidden = !(counts.unread || counts.server || named);
      x.badge.classList.toggle('dot', !named && !counts.unread && !!counts.server);
      // Being mentioned outranks a count of unread messages.
      x.badge.textContent = named ? '@' + (named > 1 ? (named > 9 ? '9+' : named) : '')
        : counts.unread ? (counts.unread > 99 ? '99+' : String(counts.unread)) : '';
      x.button.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
      x.button.setAttribute('aria-label', named ? 'Chat, mentioned ' + named + (named === 1 ? ' time' : ' times')
        : counts.unread ? 'Chat, ' + counts.unread + ' unread' : 'Chat');
    });
  }

  // ── Sheets: compose, people, mutes ────────────────────────────────────
  // One panel over the window at a time.

  function sheet(title) {
    var s = els.sheet;
    s.textContent = '';
    var head = el('div', 'gv-chat-head');
    var t = el('div', 'gv-chat-title');
    t.appendChild(el('b', '', title));
    head.appendChild(t);
    head.appendChild(iconButton('Close', '\u00d7', closeSheet));
    var body = el('div', 'gv-chat-sheet-body');
    s.appendChild(head);
    s.appendChild(body);
    s.hidden = false;
    return body;
  }

  function closeSheet() {
    if (els.sheet) els.sheet.hidden = true;
  }

  // A username box and what it finds. pick(person) runs on a click.
  function search(body, label, pick) {
    var box = el('input', 'gv-chat-field');
    box.placeholder = 'Type a username';
    box.setAttribute('aria-label', label);
    var found = el('div', 'gv-chat-people');
    var timer = null;
    var asked = '';
    box.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var q = box.value.trim();
        asked = q;
        if (q.length < 2) {
          found.textContent = '';
          if (q) found.appendChild(el('p', '', 'Keep typing\u2026'));
          return;
        }
        social().rpc('gv_user_search', { p_q: q }).then(function (people) {
          if (asked !== q) return;
          found.textContent = '';
          if (!people.length) found.appendChild(el('p', '', 'Nobody by that name.'));
          people.forEach(function (p) {
            var line = el('div', 'gv-chat-person');
            var face = el('span', 'gv-chat-dot');
            if (window.GV && GV.avatars) GV.avatars.render(face, { preset: p.preset, upload: p.upload, id: p.id });
            else face.textContent = initials(p.username);
            line.appendChild(face);
            var who = el('span', '', p.username);
            if (p.verified) who.appendChild(check());
            line.appendChild(who);
            line.appendChild(pill(label, '', function () { pick(p, line); }));
            found.appendChild(line);
          });
        }, function (error) {
          found.textContent = '';
          found.appendChild(el('p', '', error.message));
        });
      }, 250);
    });
    body.appendChild(box);
    body.appendChild(found);
    setTimeout(function () { box.focus(); });
    return box;
  }

  function openDm(person) {
    return social().rpc('gv_dm_open', { p_user: person.id }).then(function (id) {
      return refreshList().then(function () { view('convo:' + id, true); });
    });
  }

  function compose(kind) {
    if (kind === 'group') return groupSheet();
    var body = sheet('New message');
    body.appendChild(el('p', '', 'Message anyone on GameVault by their username.'));
    var note = el('p');
    search(body, 'Message', function (person) {
      openDm(person).catch(function (error) { note.textContent = error.message; });
    });
    body.appendChild(note);
  }

  function groupSheet() {
    var body = sheet('New group chat');
    var name = el('input', 'gv-chat-field');
    name.placeholder = 'Group name (optional)';
    name.maxLength = 40;
    body.appendChild(name);
    var chips = el('div', 'gv-chat-chips');
    var picked = {};
    function paint() {
      chips.textContent = '';
      Object.keys(picked).forEach(function (id) {
        chips.appendChild(pill(picked[id] + ' \u00d7', '', function () {
          delete picked[id];
          paint();
        }));
      });
      make.disabled = !Object.keys(picked).length;
    }
    body.appendChild(chips);
    search(body, 'Add', function (person) {
      if (Object.keys(picked).length >= 19) return;
      picked[person.id] = person.username;
      paint();
    });
    var note = el('p');
    var make = pill('Make the group', 'primary', function () {
      make.disabled = true;
      social().rpc('gv_group_create', { p_name: name.value, p_users: Object.keys(picked) })
        .then(function (id) {
          return refreshList().then(function () { view('convo:' + id, true); });
        })
        .catch(function (error) {
          note.textContent = error.message;
          make.disabled = false;
        });
    });
    var row = el('div', 'gv-chat-actions');
    row.appendChild(make);
    body.appendChild(row);
    body.appendChild(note);
    paint();
  }

  function membersSheet() {
    var c = convoFor(current);
    if (!c) return;
    var body = sheet(convoName(c));
    var people = el('div', 'gv-chat-people');
    people.appendChild(personLine('You'));
    (c.members || []).forEach(function (m) { people.appendChild(personLine(m.username, m.verified)); });
    body.appendChild(people);
    var note = el('p');
    body.appendChild(el('p', '', 'Add people'));
    search(body, 'Add', function (person, line) {
      social().rpc('gv_group_add', { p_convo: c.id, p_users: [person.id] }).then(function () {
        line.remove();
        return refreshList().then(function () { load(current); membersSheet(); });
      }, function (error) { note.textContent = error.message; });
    });
    body.appendChild(note);
    var row = el('div', 'gv-chat-actions');
    row.appendChild(pill('Leave the group', 'danger', function () {
      social().rpc('gv_group_leave', { p_convo: c.id }).then(function () {
        delete threads[current];
        return refreshList().then(function () { view('server', mode === 'full'); });
      }, function (error) { note.textContent = error.message; });
    }));
    body.appendChild(row);
  }

  function personLine(name, verified) {
    var line = el('div', 'gv-chat-person');
    var face = el('span', 'gv-chat-dot', initials(name));
    line.appendChild(face);
    var label = el('span', '', name);
    if (verified) label.appendChild(check());
    line.appendChild(label);
    return line;
  }

  var BELL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  var BELL_OFF = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/></svg>';

  // Mutes stop pop-ups over games. The messages still come in here.
  function muteSheet(key, name) {
    var body = sheet('Mute ' + name);
    var until = social().me().mutes[key];
    var on = social().muted(key);
    body.appendChild(el('p', '', on
      ? (until === 0 ? 'Muted until you turn it back on.' : 'Muted until ' + when(new Date(until).toISOString()) + '.')
      : 'New messages from ' + name + ' stop popping up over your game. They still show here.'));
    var row = el('div', 'gv-chat-actions');
    var note = el('p');
    function set(value) {
      social().mute(key, value).then(function () {
        closeSheet();
        paintHead();
        paintList();
      }, function (error) { note.textContent = error.message; });
    }
    MUTES.forEach(function (m) {
      row.appendChild(pill(m.label, '', function () { set(m.ms ? Date.now() + m.ms : 0); }));
    });
    if (on) row.appendChild(pill('Unmute', 'primary', function () { set(null); }));
    body.appendChild(row);
    body.appendChild(note);
  }

  function paintNotify() {
    if (!els.notify) return;
    var on = social().me().notify !== false;
    els.notify.innerHTML = on ? BELL : BELL_OFF;
    els.notify.classList.toggle('on', !on);
    els.notify.title = on ? 'Pop-ups over games are on' : 'Pop-ups over games are off';
    els.notify.setAttribute('aria-label', els.notify.title);
  }

  function toggleNotify() {
    var on = social().me().notify !== false;
    social().setNotify(!on).then(paintNotify, function (error) { say(error.message, 'error'); });
  }

  function personSheet(id, name) {
    var body = sheet(name);
    var note = el('p');
    var row = el('div', 'gv-chat-actions');
    row.appendChild(pill('Message', 'primary', function () {
      openDm({ id: id }).catch(function (error) { note.textContent = error.message; });
    }));
    row.appendChild(pill(social().muted('user:' + id) ? 'Muted' : 'Mute', '', function () {
      muteSheet('user:' + id, name);
    }));
    var add = pill('Add friend', '', function () {
      add.disabled = true;
      social().rpc('gv_friend_ask', { p_user: id }).then(function (state) {
        add.textContent = state === 'friends' ? 'Friends' : 'Request sent';
      }, function (error) {
        note.textContent = error.message;
        add.disabled = false;
      });
    });
    row.appendChild(add);
    body.appendChild(row);
    body.appendChild(note);
  }

  // ── Reports ───────────────────────────────────────────────────────────

  function closeReport(row) {
    var flag = row.querySelector('.gv-msg-flag');
    if (flag) flag.remove();
    row.classList.remove('reporting');
  }

  function openReport(row, m, flag) {
    if (row.querySelector('.gv-msg-flag')) return closeReport(row);
    row.classList.add('reporting');
    var line = el('div', 'gv-msg-flag');
    line.appendChild(el('span', '', 'What is wrong with it?'));
    REASONS.forEach(function (reason) {
      line.appendChild(pill(reason, '', function () { report(row, m, reason, line, flag); }));
    });
    line.appendChild(pill('Cancel', '', function () { closeReport(row); }));
    row.appendChild(line);
  }

  function report(row, m, reason, line, flag) {
    Array.prototype.forEach.call(line.querySelectorAll('button'), function (b) { b.disabled = true; });
    var fn = m.convo_id ? 'gv_convo_report' : 'gv_chat_report';
    social().rpc(fn, { p_message_id: m.id, p_reason: reason }).then(function (fresh) {
      line.textContent = fresh ? 'Reported. Thanks for looking out.' : 'You already reported this one.';
      flag.textContent = 'Reported';
      flag.disabled = true;
      setTimeout(function () { closeReport(row); }, 4000);
    }, function (error) {
      line.textContent = error.message;
      setTimeout(function () { closeReport(row); }, 4000);
    });
  }

  function showGuest() {
    els.frame.hidden = true;
    var guest = root.querySelector('.gv-chat-guest');
    if (!guest) {
      guest = el('div', 'gv-chat-guest');
      guest.appendChild(el('p', '', 'Sign in to chat with everyone, message people and start group chats.'));
      var row = el('div', 'gv-chat-actions');
      if (host().signIn) {
        row.appendChild(pill('Sign in', 'primary', function () {
          close();
          host().signIn();
        }));
      } else {
        var a = el('a', 'gv-chat-pill primary', 'Sign in on the home page');
        a.href = '/';
        row.appendChild(a);
      }
      row.appendChild(pill('Close', '', close));
      guest.appendChild(row);
      root.appendChild(guest);
    }
    guest.hidden = false;
  }

  function hideGuest() {
    els.frame.hidden = false;
    var guest = root.querySelector('.gv-chat-guest');
    if (guest) guest.hidden = true;
  }

  // ── Wiring ────────────────────────────────────────────────────────────

  // Escape closes what is open in chat first, and never reaches the game
  // page's own Escape, which would close the game.
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !isOpen()) return;
    if (mode === 'inline' && els.sheet.hidden) return;
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
      paintNotify();
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

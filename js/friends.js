/* GameVault friends: who is online and what they are playing, requests, and
   adding people by username, in a panel off the Friends button on the home
   page. The status at the top decides what friends see of you. Asking to
   join a friend's PolyTrack room starts here; their game answers it in
   games/polytrack/friends.js. Data comes from sql/social.sql.
   Public surface: window.GV.friends. */
(function () {
  'use strict';

  var REFRESH_MS = 15000;

  var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14c2 .8 3.5 3 3.5 6"/></svg>';

  var CSS = [
    '.gv-fr-overlay{position:fixed;inset:0;z-index:2000;display:none;align-items:flex-start;justify-content:flex-end;padding:4.5rem 1.25rem 0}',
    '.gv-fr-overlay.show{display:flex}',
    '.gv-fr-backdrop{position:fixed;inset:0;z-index:-1}',
    '.gv-fr-panel{width:min(360px,96vw);max-height:calc(100vh - 6rem);overflow-y:auto;box-sizing:border-box;padding:1.25rem;border-radius:18px;background:var(--surface,#121216);border:1px solid var(--border-strong,rgba(255,255,255,.16));box-shadow:0 20px 60px rgba(0,0,0,.6);color:var(--text,#f4f4f6);font-size:.88rem}',
    '.gv-fr-panel [hidden]{display:none!important}',
    '.gv-fr-head{display:flex;align-items:center;gap:8px;margin-bottom:12px}',
    '.gv-fr-head b{flex:1;font-size:1rem}',
    '.gv-fr-x{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;border:1px solid var(--border,rgba(255,255,255,.07));background:transparent;color:var(--muted,#8a8a96);font:inherit;font-size:1rem;line-height:1;cursor:pointer}',
    '.gv-fr-x:hover{color:var(--text,#f4f4f6)}',
    '.gv-fr-label{font-family:"JetBrains Mono",monospace;font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;color:var(--muted-2,#54545e);margin:14px 0 8px}',
    '.gv-fr-seg{display:flex;padding:3px;gap:3px;border-radius:100px;background:var(--surface-2,#1a1a20);border:1px solid var(--border,rgba(255,255,255,.07))}',
    '.gv-fr-seg button{flex:1;padding:6px 0;border:0;border-radius:100px;background:transparent;color:var(--muted,#8a8a96);font:inherit;font-size:.78rem;font-weight:600;cursor:pointer}',
    '.gv-fr-seg button[aria-pressed="true"]{background:var(--text,#f4f4f6);color:var(--bg,#08080a)}',
    '.gv-fr-note{margin:8px 2px 0;font-size:.75rem;line-height:1.5;color:var(--muted,#8a8a96)}',
    '.gv-fr-tabs{display:flex;gap:6px;margin-top:14px;border-bottom:1px solid var(--border,rgba(255,255,255,.07))}',
    '.gv-fr-tabs button{padding:8px 4px;margin-bottom:-1px;border:0;border-bottom:2px solid transparent;background:none;color:var(--muted,#8a8a96);font:inherit;font-size:.82rem;font-weight:600;cursor:pointer}',
    '.gv-fr-tabs button[aria-selected="true"]{color:var(--text,#f4f4f6);border-bottom-color:var(--accent,#ff3b3b)}',
    '.gv-fr-list{display:flex;flex-direction:column;gap:2px;margin-top:8px}',
    '.gv-fr-row{display:flex;align-items:center;gap:10px;padding:7px 4px;border-radius:10px}',
    '.gv-fr-face{position:relative;width:32px;height:32px;flex-shrink:0;border-radius:50%;display:grid;place-items:center;background:var(--surface-2,#1a1a20);border:1px solid var(--border-strong,rgba(255,255,255,.16));font-size:.7rem;font-weight:700}',
    '.gv-fr-face>.gv-fr-pic{width:100%;height:100%;border-radius:50%;overflow:hidden;display:grid;place-items:center}',
    '.gv-fr-on{position:absolute;right:-2px;bottom:-2px;width:10px;height:10px;border-radius:50%;background:#5ce08a;border:2px solid var(--surface,#121216)}',
    '.gv-fr-who{flex:1;min-width:0}',
    '.gv-fr-who b,.gv-fr-who small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.gv-fr-who small{font-size:.72rem;color:var(--muted,#8a8a96)}',
    '.gv-fr-who small.playing{color:#5ce08a}',
    '.gv-fr-btn{flex-shrink:0;padding:4px 10px;border-radius:100px;border:1px solid var(--border-strong,rgba(255,255,255,.16));background:transparent;color:var(--text,#f4f4f6);font:inherit;font-size:.72rem;cursor:pointer;white-space:nowrap}',
    '.gv-fr-btn:hover{border-color:var(--accent,#ff3b3b)}',
    '.gv-fr-btn:disabled{opacity:.5;cursor:default}',
    '.gv-fr-btn.primary{background:var(--text,#f4f4f6);color:var(--bg,#08080a);border-color:transparent;font-weight:700}',
    '.gv-fr-btn.quiet{border-color:transparent;color:var(--muted-2,#54545e);padding:4px 6px}',
    '.gv-fr-empty{padding:16px 4px;color:var(--muted,#8a8a96);font-size:.8rem;line-height:1.5}',
    '.gv-fr-field{width:100%;box-sizing:border-box;margin-top:10px;padding:8px 12px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.07));background:var(--surface-2,#1a1a20);color:var(--text,#f4f4f6);font:inherit;font-size:.85rem;outline:none}',
    '.gv-fr-field:focus{border-color:var(--accent,#ff3b3b)}',
    '.gv-fr-msg{min-height:1rem;margin-top:8px;font-size:.75rem;color:var(--muted,#8a8a96)}',
    '.gv-fr-count{display:inline-block;min-width:16px;margin-left:4px;padding:0 4px;border-radius:100px;background:var(--accent,#ff3b3b);color:#fff;font-size:.62rem;line-height:16px;text-align:center}',
    '.gv-fr-open{position:relative;flex-shrink:0;width:38px;height:38px;display:grid;place-items:center;border-radius:50%;border:1px solid var(--border,rgba(255,255,255,.07));background:transparent;color:var(--muted,#8a8a96);cursor:pointer;transition:color .15s,border-color .15s}',
    '.gv-fr-open:hover,.gv-fr-open[aria-expanded="true"]{color:var(--text,#f4f4f6);border-color:var(--border-strong,rgba(255,255,255,.16))}',
    '.gv-fr-badge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:100px;background:var(--accent,#ff3b3b);color:#fff;font-size:.6rem;font-weight:700;line-height:16px;text-align:center}',
    '.gv-fr-badge[hidden]{display:none}',
    ''
  ].join('');

  var overlay = null;
  var els = {};
  var data = { friends: [], incoming: [], outgoing: [] };
  var tab = 'friends';
  var timer = null;
  var buttons = [];

  function social() {
    return window.GV && window.GV.social;
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

  function btn(label, cls, onClick) {
    var b = el('button', 'gv-fr-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function style() {
    if (document.getElementById('gvFriendsCss')) return;
    var st = document.createElement('style');
    st.id = 'gvFriendsCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function face(person, online) {
    var box = el('span', 'gv-fr-face');
    var pic = el('span', 'gv-fr-pic');
    if (window.GV && GV.avatars) GV.avatars.render(pic, { preset: person.preset, upload: person.upload, id: person.id });
    else pic.textContent = (person.username || '?').slice(0, 2).toUpperCase();
    box.appendChild(pic);
    if (online) box.appendChild(el('span', 'gv-fr-on'));
    return box;
  }

  function personRow(person, line, online, lineClass) {
    var row = el('div', 'gv-fr-row');
    row.appendChild(face(person, online));
    var who = el('div', 'gv-fr-who');
    who.appendChild(el('b', '', person.username));
    if (line) who.appendChild(el('small', lineClass || '', line));
    row.appendChild(who);
    return row;
  }

  function build() {
    if (overlay) return;
    style();
    overlay = el('div', 'gv-fr-overlay');
    var back = el('div', 'gv-fr-backdrop');
    back.addEventListener('click', close);
    var panel = el('div', 'gv-fr-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Friends');

    var head = el('div', 'gv-fr-head');
    head.appendChild(el('b', '', 'Friends'));
    var x = el('button', 'gv-fr-x', '\u00d7');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    head.appendChild(x);
    panel.appendChild(head);


    els.tabs = el('div', 'gv-fr-tabs');
    els.tabs.setAttribute('role', 'tablist');
    [['friends', 'Friends'],
    ].forEach(function (t) {
      var b = el('button', '', t[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.tab = t[0];
      b.addEventListener('click', function () { show(t[0]); });
      els.tabs.appendChild(b);
    });
    panel.appendChild(els.tabs);
    els.body = el('div');
    panel.appendChild(els.body);
    els.msg = el('div', 'gv-fr-msg');
    els.msg.setAttribute('aria-live', 'polite');
    panel.appendChild(els.msg);

    overlay.appendChild(back);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Escape shuts the panel and nothing else. The game page closes its game
    // on Escape too.
    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !isOpen()) return;
      e.stopImmediatePropagation();
      close();
    }, true);
  }

  function isOpen() {
    return !!(overlay && overlay.classList.contains('show'));
  }

  function flash(text) {
    els.msg.textContent = text || '';
  }

  function open(which) {
    build();
    overlay.classList.add('show');
    flash('');
    paintButtons();
    if (!social() || !social().user()) return showGuest();
    els.tabs.hidden = false;
    show(which || tab);
    load();
    clearInterval(timer);
    timer = setInterval(load, REFRESH_MS);
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('show');
    clearInterval(timer);
    timer = null;
    paintButtons();
  }

  function showGuest() {
    els.tabs.hidden = true;
    els.body.textContent = '';
    els.body.appendChild(el('p', 'gv-fr-empty', 'Sign in to add friends, see what they are playing and join their PolyTrack rooms.'));
    if (host().signIn) {
      els.body.appendChild(btn('Sign in', 'primary', function () {
        close();
        host().signIn();
      }));
    }
  }

  function load() {
    return social().rpc('gv_friends').then(function (d) {
      data = d;
      paint();
    }, function (error) { flash(error.message); });
  }

  function show(which) {
    tab = which;
    Array.prototype.forEach.call(els.tabs.children, function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === which ? 'true' : 'false');
    });
    paint();
  }

  function paint() {
    if (!isOpen() || !social().user()) return;
    if (tab === 'friends') return paintFriends();
  }

  function gameName(id) {
    var h = host();
    return (h.gameTitle && h.gameTitle(id)) || id;
  }

  function paintFriends() {
    els.body.textContent = '';
    var list = el('div', 'gv-fr-list');
    if (!data.friends.length) {
      list.appendChild(el('p', 'gv-fr-empty', 'No friends yet. Add people by their username.'));
    }
    data.friends.forEach(function (f) {
      var line = !f.online ? 'Offline' : f.game_id ? 'Playing ' + gameName(f.game_id) : 'Online';
      var row = personRow(f, line, f.online, f.online && f.game_id ? 'playing' : '');
      row.appendChild(btn('\u00d7', 'quiet', function () {
        if (!confirm('Remove ' + f.username + ' from your friends?')) return;
        social().rpc('gv_friend_remove', { p_user: f.id }).then(load, function (error) { flash(error.message); });
      })).setAttribute('aria-label', 'Remove ' + f.username);
      list.appendChild(row);
    });
    els.body.appendChild(list);
  }





  // ── The Friends button ────────────────────────────────────────────────

  function mount(container) {
    if (!container || container.querySelector('.gv-fr-open')) return;
    style();
    var b = el('button', 'gv-fr-open');
    b.type = 'button';
    b.setAttribute('aria-label', 'Friends');
    b.setAttribute('aria-expanded', 'false');
    b.title = 'Friends';
    b.innerHTML = ICON;
    var badge = el('span', 'gv-fr-badge');
    badge.hidden = true;
    b.appendChild(badge);
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isOpen()) close();
      else open(social() && social().counts().requests ? 'requests' : null);
    });
    container.appendChild(b);
    buttons.push({ button: b, badge: badge });
    paintButtons();
  }

  function paintButtons() {
    var n = (social() && social().counts().requests) || 0;
    buttons.forEach(function (x) {
      x.badge.hidden = !n;
      x.badge.textContent = n > 99 ? '99+' : String(n);
      x.button.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
      x.button.setAttribute('aria-label', n ? 'Friends, ' + n + ' requests' : 'Friends');
    });
  }

  function wire() {
    var s = social();
    if (!s) return;
    s.on('counts', function (counts) {
      paintButtons();
      // A new request shows up in the list while it is open.
      if (isOpen() && counts.requests !== data.incoming.length) load();
    });
    s.on('state', function () {
      close();
      data = { friends: [], incoming: [], outgoing: [] };
    });
  }

  window.GV = window.GV || {};
  window.GV.friends = {
    open: open,
    close: close,
    mount: mount
  };

  if (window.GV.social) wire();
  else document.addEventListener('DOMContentLoaded', wire);
}());

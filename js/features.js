/* GameVault feature cards: the site's big features as cards on the home
   page, each with a line that is about the player where there is one, like
   unread messages, friends online or coins. NEW marks the newest features for
   two weeks, until they are opened.
   Public surface: window.GV.features.mount(container), .set(id, text). */
(function () {
  'use strict';

  var FRIENDS_MS = 60 * 1000;

  var FEATURES = [
    { id: 'chat', label: 'Chat', line: 'Message friends and start groups', added: '2026-10-02', href: '/chat/', module: 'chat',
      icon: '<path d="M4 5h16v10H9l-5 4z"/>' },
    { id: 'friends', label: 'Friends', line: 'See what friends play and join them', added: '2026-10-02', module: 'friends',
      icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14c2 .8 3.5 3 3.5 6"/>' },
    { id: 'leaderboard', label: 'Leaderboard', line: 'Top players and this week\u2019s leaders', added: '2026-10-01', href: '/leaderboard/',
      icon: '<path d="M4 20h16"/><rect x="5" y="11" width="4" height="9"/><rect x="10" y="6" width="4" height="14"/><rect x="15" y="14" width="4" height="6"/>' },
    { id: 'shop', label: 'Shop', line: 'Spend the coins you earn by playing', added: '2026-10-01', href: '/shop/',
      icon: '<path d="M4 8h16l-1.5 11h-13z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>' },
    { id: 'challenge', label: 'Challenge', line: 'A new PolyTrack track every week', added: '2026-10-01', href: '/challenge/',
      icon: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/>' },
    { id: 'saves', label: 'Saves', line: 'Back up your game progress', added: '2026-10-01', href: '/saves/',
      icon: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>' }
  ];

  var CSS = [
    '.gv-feats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;max-width:620px;margin:1.75rem auto 0;text-align:left}',
    '.gv-feat{position:relative;display:flex;align-items:center;gap:12px;min-width:0;padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--border-strong);color:var(--text);font:inherit;text-align:left;text-decoration:none;cursor:pointer;transition:border-color .15s,transform .15s}',
    '.gv-feat:hover{border-color:var(--accent);transform:translateY(-2px)}',
    '.gv-feat:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    '.gv-feat-icon{width:38px;height:38px;flex-shrink:0;display:grid;place-items:center;border-radius:10px;background:var(--surface-2);color:var(--text)}',
    '.gv-feat-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.gv-feat-text{flex:1;min-width:0}',
    '.gv-feat-name{display:block;font-size:.92rem;font-weight:600}',
    '.gv-feat-line{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:2px;font-size:.74rem;line-height:1.35;color:var(--muted)}',
    '.gv-feat-line.live{color:var(--text);font-weight:600}',
    '.gv-feat-line.hot{color:var(--accent);font-weight:600}',
    '@media (prefers-reduced-motion:reduce){.gv-feat{transition:none}.gv-feat:hover{transform:none}}'
  ].join('');

  var cards = {};
  // Lines handed in from outside, like the coins from the page's wallet.
  var given = {};
  var friends = null;
  var friendsTimer = null;

  function style() {
    if (document.getElementById('gvFeaturesCss')) return;
    var st = document.createElement('style');
    st.id = 'gvFeaturesCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function social() {
    return window.GV && window.GV.social;
  }



  function card(f) {
    var el = document.createElement(f.href ? 'a' : 'button');
    el.className = 'gv-feat';
    if (f.href) el.href = f.href;
    else el.type = 'button';
    el.innerHTML = '<span class="gv-feat-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + f.icon + '</svg></span>';
    var text = document.createElement('span');
    text.className = 'gv-feat-text';
    var name = document.createElement('span');
    name.className = 'gv-feat-name';
    name.textContent = f.label;
    var line = document.createElement('span');
    line.className = 'gv-feat-line';
    line.textContent = f.line;
    text.appendChild(name);
    text.appendChild(line);
    el.appendChild(text);
    el.addEventListener('click', function (e) {
      // Chat and friends open right here. Without them, chat still has its
      // own page to go to.
      var mod = f.module && window.GV && GV[f.module];
      if (!mod) return;
      e.preventDefault();
      mod.open();
    });
    cards[f.id] = {
      el: el,
      line: line,
    };
    return el;
  }

  function lineFor(f) {
    var s = social();
    var counts = (s && s.user() && s.counts()) || null;
    if (f.id === 'chat' && counts) {
      if (counts.unread) return { text: counts.unread + ' unread message' + (counts.unread === 1 ? '' : 's'), hot: true };
      if (counts.server) return { text: 'New messages in the server room', live: true };
    }
    if (f.id === 'friends' && counts) {
      if (counts.requests) return { text: counts.requests + ' friend request' + (counts.requests === 1 ? '' : 's'), hot: true };
      if (friends) {
        var on = friends.filter(function (x) { return x.online; }).length;
        if (on) return { text: on + ' online now', live: true };
        if (!friends.length) return { text: 'Add friends by their username' };
      }
    }
    if (given[f.id]) return { text: given[f.id], live: true };
    return { text: f.line };
  }

  function paint() {
    FEATURES.forEach(function (f) {
      var c = cards[f.id];
      if (!c) return;
      var now = lineFor(f);
      c.line.textContent = now.text;
      c.line.classList.toggle('hot', !!now.hot);
      c.line.classList.toggle('live', !!now.live);
    });
  }

  // Who is online needs the friends list, asked for once a minute while
  // the page is on screen.
  function loadFriends() {
    var s = social();
    if (!s || !s.user() || document.hidden) return;
    s.rpc('gv_friends').then(function (data) {
      friends = data.friends || [];
      paint();
    }, function () {});
  }

  function watchFriends(user) {
    clearInterval(friendsTimer);
    friends = null;
    paint();
    if (!user) return;
    loadFriends();
    friendsTimer = setInterval(loadFriends, FRIENDS_MS);
  }

  function mount(container) {
    if (!container || container.querySelector('.gv-feats')) return;
    style();
    var grid = document.createElement('nav');
    grid.className = 'gv-feats';
    grid.setAttribute('aria-label', 'Features');
    FEATURES.forEach(function (f) { grid.appendChild(card(f)); });
    container.appendChild(grid);
    paint();
    var s = social();
    if (!s) return;
    s.on('counts', paint);
    s.on('state', function (user) {
      paint();
      watchFriends(user);
    });
    if (s.user()) watchFriends(s.user());
  }

  // text: what to show on the card instead of its usual line, or null.
  function set(id, text) {
    given[id] = text || null;
    paint();
  }

  window.GV = window.GV || {};
  window.GV.features = {
    mount: mount,
    set: set,
    list: FEATURES
  };
}());

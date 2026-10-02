/* GameVault polls (polls/polls.sql). The newest open poll someone has not
   answered pops up when they come to the site, and they can vote right in
   it. /polls/ shows every poll. One vote each: per account, and per browser
   for a guest. Answers can come with pictures, which open big on a click.
   Public surface: window.GV.polls.ask(), .card(poll), .use(client), .rpc. */
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  // Polls put off with Not now, by id, and when.
  var LATER_KEY = 'gv.poll.later';
  var LATER_MS = 24 * 60 * 60 * 1000;
  // Not now waits this long, so the question gets read first.
  var NOT_NOW_MS = 3000;

  var CSS = [
    '.gv-poll{text-align:left}',
    '.gv-poll-kicker{display:flex;align-items:center;gap:8px;font-family:"JetBrains Mono",monospace;font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:var(--accent,#ff3b3b)}',
    '.gv-poll-kicker::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--accent,#ff3b3b);box-shadow:0 0 10px var(--accent,#ff3b3b)}',
    '.gv-poll-q{margin:.5rem 0 1rem;font-size:1.2rem;font-weight:700;line-height:1.3;letter-spacing:-.01em;color:var(--text,#f4f4f6);overflow-wrap:anywhere}',
    '.gv-poll-opts{display:flex;flex-direction:column;gap:8px}',
    '.gv-poll-opt{position:relative;width:100%;display:flex;align-items:center;gap:10px;padding:11px 14px;overflow:hidden;border-radius:10px;border:1px solid var(--border-strong,rgba(255,255,255,.16));background:var(--surface-2,#1a1a20);color:var(--text,#f4f4f6);font:inherit;font-size:.92rem;text-align:left;cursor:pointer;transition:border-color .15s}',
    'button.gv-poll-opt:hover{border-color:var(--accent,#ff3b3b)}',
    'button.gv-poll-opt:disabled{cursor:default;opacity:.6}',
    '.gv-poll-opt span{position:relative;min-width:0;overflow-wrap:anywhere}',
    '.gv-poll-opt .gv-poll-name{flex:1}',
    '.gv-poll-opt .gv-poll-pct{font-family:"JetBrains Mono",monospace;font-size:.78rem;color:var(--muted,#8a8a96);white-space:nowrap}',
    '.gv-poll-opt.result{cursor:default}',
    '.gv-poll-opt.result::before{content:"";position:absolute;inset:0 auto 0 0;width:var(--p,0%);background:rgba(255,255,255,.07);transition:width .5s cubic-bezier(.2,.8,.2,1)}',
    '.gv-poll-opt.mine{border-color:var(--accent,#ff3b3b)}',
    '.gv-poll-opt.mine::before{background:rgba(255,59,59,.22)}',
    '.gv-poll-meta{margin-top:10px;font-size:.78rem;color:var(--muted,#8a8a96)}',
    '.gv-poll-err{margin-top:8px;font-size:.8rem;color:#ff7a7a}',
    '.gv-poll-err:empty{display:none}',
    '.gv-poll-pop{position:fixed;inset:0;z-index:2600;display:grid;place-items:center;padding:16px;background:rgba(8,8,10,.62);backdrop-filter:blur(5px)}',
    '.gv-poll-box{width:min(440px,100%);max-height:calc(100vh - 32px);overflow-y:auto;padding:22px;border-radius:16px;border:1px solid var(--border-strong,rgba(255,255,255,.16));background:var(--surface,#121216);box-shadow:0 24px 70px rgba(0,0,0,.6);animation:gvPollIn .25s cubic-bezier(.2,.8,.2,1)}',
    '.gv-poll-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:16px}',
    '.gv-poll-foot a{font-size:.8rem;color:var(--muted,#8a8a96);text-decoration:underline;text-underline-offset:3px}',
    '.gv-poll-foot a:hover{color:var(--text,#f4f4f6)}',
    '.gv-poll-later{margin-left:auto;padding:8px 16px;border-radius:100px;border:1px solid var(--border-strong,rgba(255,255,255,.16));background:none;color:var(--text,#f4f4f6);font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;opacity:0;visibility:hidden;transition:opacity .3s}',
    '.gv-poll-later.on{opacity:1;visibility:visible}',
    '.gv-poll-later:hover{border-color:var(--accent,#ff3b3b)}',
    '.gv-poll-looks{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}',
    '.gv-poll-look{display:flex;flex-direction:column;gap:8px;min-width:0;padding:8px 8px 10px;border-radius:12px;border:1px solid var(--border-strong,rgba(255,255,255,.16));background:var(--surface-2,#1a1a20);color:var(--text,#f4f4f6);font:inherit;text-align:left;cursor:pointer;transition:border-color .15s,transform .15s}',
    '.gv-poll-shot{position:relative;display:block;aspect-ratio:1366/635;overflow:hidden;border-radius:7px;background:#0c0c0e}',
    '.gv-poll-shot img{display:block;width:100%;height:100%;object-fit:cover}',
    '.gv-poll-look:hover{border-color:var(--accent,#ff3b3b);transform:translateY(-2px)}',
    '.gv-poll-look:disabled{cursor:default;opacity:.6;transform:none}',
    '.gv-poll-look-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:0 2px;font-size:.9rem;font-weight:600}',
    '.gv-poll-look-row span{min-width:0;overflow-wrap:anywhere}',
    '.gv-poll-look .gv-poll-pct{font-family:"JetBrains Mono",monospace;font-size:.74rem;font-weight:400;color:var(--muted,#8a8a96);white-space:nowrap}',
    '.gv-poll-bar{display:block;height:4px;margin:0 2px;overflow:hidden;border-radius:2px;background:var(--surface,#121216)}',
    '.gv-poll-bar span{display:block;width:var(--p,0%);height:100%;background:var(--muted,#8a8a96);transition:width .5s cubic-bezier(.2,.8,.2,1)}',
    '.gv-poll-look.mine{border-color:var(--accent,#ff3b3b)}',
    '.gv-poll-look.mine .gv-poll-bar span{background:var(--accent,#ff3b3b)}',
    '.gv-poll-box.wide{width:min(880px,100%)}',
    '.gv-look{position:fixed;inset:0;z-index:2700;display:flex;flex-direction:column;gap:12px;padding:16px;background:rgba(8,8,10,.94);color:#f4f4f6}',
    '.gv-look-top,.gv-look-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;width:min(1366px,100%);margin:0 auto}',
    '.gv-look-name{font-size:1.1rem;font-weight:700;overflow-wrap:anywhere}',
    '.gv-look-count{font-family:"JetBrains Mono",monospace;font-size:.74rem;color:#8a8a96}',
    '.gv-look-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}',
    '.gv-look-fit{position:relative;flex-shrink:0}',
    '.gv-look-frame{position:absolute;top:0;left:0;width:1366px;overflow:hidden;transform-origin:0 0;border-radius:14px;background:#0c0c0e;box-shadow:0 0 0 1px rgba(255,255,255,.16),0 30px 80px rgba(0,0,0,.6)}',
    '.gv-look-screen{position:relative;height:635px}',
    '.gv-look-screen img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
    '.gv-look-btn{width:40px;height:40px;flex-shrink:0;display:grid;place-items:center;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:#121216;color:#f4f4f6;font:inherit;font-size:1.1rem;line-height:1;cursor:pointer}',
    '.gv-look-btn:hover{border-color:#ff3b3b}',
    '.gv-look-close{margin-left:auto}',
    '.gv-look-pick{margin-left:auto;padding:10px 22px;border-radius:100px;border:1px solid #ff3b3b;background:#ff3b3b;color:#fff;font:inherit;font-size:.9rem;font-weight:600;cursor:pointer}',
    '.gv-look-note{font-size:.84rem;color:#8a8a96}',
    '.gv-poll-hint{margin:-.4rem 0 1rem;font-size:.84rem;color:var(--muted,#8a8a96)}',
    '.gv-poll-note{display:block;padding:0 2px;overflow:hidden;font-size:.78rem;line-height:1.35;color:var(--muted,#8a8a96);white-space:nowrap;text-overflow:ellipsis}',
    '.gv-poll-try{position:absolute;right:8px;bottom:8px;padding:4px 10px;border-radius:100px;background:rgba(8,8,10,.8);color:#f4f4f6;font-size:.72rem;font-weight:600;transition:background .15s}',
    '.gv-poll-try::before{content:"";display:inline-block;margin-right:6px;border-style:solid;border-width:4px 0 4px 6px;border-color:transparent transparent transparent currentColor;vertical-align:1px}',
    '.gv-poll-look:hover .gv-poll-try{background:var(--accent,#ff3b3b)}',
    '.gv-look-chrome{position:relative;display:flex;align-items:center;gap:7px;height:34px;padding:0 14px;background:#1a1a20;border-bottom:1px solid rgba(255,255,255,.08)}',
    '.gv-look-chrome i{width:11px;height:11px;border-radius:50%;background:rgba(255,255,255,.16)}',
    '.gv-look-url{position:absolute;left:50%;transform:translateX(-50%);padding:4px 16px;border-radius:7px;background:#08080a;font-family:"JetBrains Mono",monospace;font-size:12px;color:#8a8a96}',
    '.gv-look-screen iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#0c0c0e;opacity:0;transition:opacity .25s}',
    '.gv-look-screen.ready iframe{opacity:1}',
    '@keyframes gvPollIn{from{opacity:0;transform:translateY(10px) scale(.98)}}',
    '@media (prefers-reduced-motion:reduce){.gv-poll-box{animation:none}.gv-poll-opt.result::before,.gv-poll-look,.gv-poll-bar span{transition:none}}'
  ].join('');

  var client = null;

  function style() {
    if (document.getElementById('gvPollsCss')) return;
    var st = document.createElement('style');
    st.id = 'gvPollsCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // A page with its own Supabase client hands it over here, so a signed-in
  // player votes as their account.
  function use(sb) {
    client = sb;
  }

  // As the account when someone is signed in, otherwise as a guest with the
  // site's public key. Every refusal is a sentence to show as it is.
  function rpc(name, args) {
    if (client) {
      return client.rpc(name, args).then(function (res) {
        if (res.error) throw new Error(res.error.code === 'P0001' ? res.error.message : 'Could not reach GameVault. Try again.');
        return res.data;
      });
    }
    return fetch(SUPA_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        if (!r.ok) throw new Error(body && body.code === 'P0001' ? body.message : 'Could not reach GameVault. Try again.');
        return body;
      });
    });
  }

  // This browser's id (js/identity.js), which a guest votes as.
  function visitor() {
    var id = window.GV && GV.identity;
    if (id && id.ready) return id.ready.then(function (v) { return v || id.id(); });
    try { return Promise.resolve(localStorage.getItem('gv.vid')); } catch (e) { return Promise.resolve(null); }
  }

  function plural(n, one, many) {
    return n.toLocaleString() + ' ' + (n === 1 ? one : many);
  }

  function endsLine(poll) {
    if (!poll.open) return 'Over';
    if (!poll.ends_at) return 'Open';
    var left = Date.parse(poll.ends_at) - Date.now();
    var days = Math.round(left / 86400000), hours = Math.round(left / 3600000);
    if (days >= 2) return 'Ends in ' + plural(days, 'day', 'days');
    if (hours >= 2) return 'Ends in ' + plural(hours, 'hour', 'hours');
    return 'Ends soon';
  }

  // A path on this site, or null. Poll pictures and pages only come from here.
  function local(src) {
    return typeof src === 'string' && /^\/[^\/\\]/.test(src) ? src : null;
  }

  // An answer's picture, if the poll has one for it.
  function shot(poll, i) {
    var m = poll.media && poll.media[i];
    return m ? local(m.img) : null;
  }

  // An answer's live page to try, if it has one.
  function livePage(poll, i) {
    var m = poll.media && poll.media[i];
    return m ? local(m.page) : null;
  }

  // A line about an answer, if it has one.
  function blurb(poll, i) {
    var m = poll.media && poll.media[i];
    return m && typeof m.note === 'string' ? m.note.slice(0, 140) : '';
  }

  function hasLooks(poll) {
    return (poll.options || []).some(function (name, i) { return shot(poll, i); });
  }

  // One poll: the answers to pick from, or the results once there are any
  // to show. onChange hears about a vote with the poll as it is now.
  function card(poll, onChange) {
    style();
    var box = el('div', 'gv-poll');
    var q = el('h3', 'gv-poll-q', poll.question);
    var tryable = (poll.options || []).some(function (name, i) { return livePage(poll, i); });
    var hint = el('p', 'gv-poll-hint', tryable ? 'Click one to try it live, then pick your favorite.' : 'Click a picture to see it big.');
    var opts = el('div', 'gv-poll-opts');
    var meta = el('div', 'gv-poll-meta');
    var err = el('div', 'gv-poll-err');
    err.setAttribute('role', 'status');
    box.appendChild(q);
    box.appendChild(hint);
    box.appendChild(opts);
    box.appendChild(meta);
    box.appendChild(err);

    function paint(p) {
      opts.textContent = '';
      var showing = p.counts && p.counts.length;
      var total = showing ? p.counts.reduce(function (a, b) { return a + b; }, 0) : 0;
      var looks = hasLooks(p);
      opts.className = looks ? 'gv-poll-looks' : 'gv-poll-opts';
      hint.hidden = !looks || !!showing;
      (p.options || []).forEach(function (name, i) {
        if (looks) return opts.appendChild(tile(p, i, total));
        var row;
        if (showing) {
          var n = p.counts[i] || 0, pct = total ? Math.round(100 * n / total) : 0;
          row = el('div', 'gv-poll-opt result' + (p.voted === i ? ' mine' : ''));
          row.style.setProperty('--p', pct + '%');
          row.appendChild(el('span', 'gv-poll-name', name));
          row.appendChild(el('span', 'gv-poll-pct', pct + '% \u00b7 ' + n.toLocaleString()));
        } else {
          row = el('button', 'gv-poll-opt');
          row.type = 'button';
          row.appendChild(el('span', 'gv-poll-name', name));
          row.disabled = !p.open;
          row.addEventListener('click', function () { vote(p, i); });
        }
        opts.appendChild(row);
      });
      var bits = [plural(p.total || 0, 'vote', 'votes'), endsLine(p)];
      if (p.voted != null && p.options[p.voted] != null) bits.push('You picked ' + p.options[p.voted]);
      meta.textContent = bits.join(' \u00b7 ');
    }

    // A picture answer: the picture, with the answer under it. A click opens
    // it big, with a button to pick it while there is a vote to give.
    function tile(p, i, total) {
      var showing = p.counts && p.counts.length;
      var t = el('button', 'gv-poll-look' + (p.voted === i ? ' mine' : ''));
      t.type = 'button';
      var frame = el('span', 'gv-poll-shot');
      var src = shot(p, i);
      if (src) {
        var img = el('img');
        img.src = src;
        img.alt = '';
        frame.appendChild(img);
      }
      if (livePage(p, i)) frame.appendChild(el('span', 'gv-poll-try', 'Try it live'));
      t.appendChild(frame);
      var row = el('span', 'gv-poll-look-row');
      row.appendChild(el('span', 'gv-poll-name', p.options[i]));
      t.appendChild(row);
      if (blurb(p, i)) t.appendChild(el('span', 'gv-poll-note', blurb(p, i)));
      if (showing) {
        var n = p.counts[i] || 0, pct = total ? Math.round(100 * n / total) : 0;
        row.appendChild(el('span', 'gv-poll-pct', pct + '% \u00b7 ' + n.toLocaleString()));
        var bar = el('span', 'gv-poll-bar');
        var fill = el('span');
        fill.style.setProperty('--p', pct + '%');
        bar.appendChild(fill);
        t.appendChild(bar);
      }
      t.addEventListener('click', function () { look(p, i, showing ? null : vote); });
      return t;
    }

    function vote(p, i) {
      err.textContent = '';
      Array.prototype.forEach.call(opts.querySelectorAll('button'), function (b) { b.disabled = true; });
      visitor().then(function (v) {
        return rpc('gv_poll_vote', { p_poll: p.id, p_option: i, p_visitor: v });
      }).then(function (fresh) {
        paint(fresh);
        if (onChange) onChange(fresh);
      }, function (e) {
        err.textContent = e.message;
        Array.prototype.forEach.call(opts.querySelectorAll('button'), function (b) { b.disabled = !p.open; });
      });
    }

    paint(poll);
    return box;
  }

  // One answer's picture as big as the screen allows. The other answers are
  // a click or an arrow key away, and pick, when given, votes for the one
  // showing.
  function look(p, start, pick) {
    style();
    var at = start;
    var back = document.activeElement;
    var shade = el('div', 'gv-look');
    shade.setAttribute('role', 'dialog');
    shade.setAttribute('aria-modal', 'true');
    var top = el('div', 'gv-look-top');
    var name = el('div', 'gv-look-name');
    var count = el('div', 'gv-look-count');
    var close = el('button', 'gv-look-btn gv-look-close', '\u00d7');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    top.appendChild(name);
    top.appendChild(count);
    top.appendChild(close);
    var stage = el('div', 'gv-look-stage');
    var fitBox = el('div', 'gv-look-fit');
    var frame = el('div', 'gv-look-frame');
    var screen = el('div', 'gv-look-screen');
    var img = el('img');
    screen.appendChild(img);
    var live = el('iframe');
    live.addEventListener('load', function () {
      screen.classList.add('ready');
    });
    screen.appendChild(live);
    var chrome = el('div', 'gv-look-chrome');
    chrome.appendChild(el('i'));
    chrome.appendChild(el('i'));
    chrome.appendChild(el('i'));
    chrome.appendChild(el('span', 'gv-look-url', location.host || 'GameVault'));
    frame.appendChild(chrome);
    frame.appendChild(screen);
    fitBox.appendChild(frame);
    stage.appendChild(fitBox);
    var bar = el('div', 'gv-look-bar');
    var prev = el('button', 'gv-look-btn', '\u2190');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous');
    var next = el('button', 'gv-look-btn', '\u2192');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next');
    var note = el('div', 'gv-look-note');
    var choose = el('button', 'gv-look-pick', 'Pick this one');
    choose.type = 'button';
    choose.hidden = !pick;
    bar.appendChild(prev);
    bar.appendChild(next);
    bar.appendChild(note);
    bar.appendChild(choose);
    shade.appendChild(top);
    shade.appendChild(stage);
    shade.appendChild(bar);

    function show(i) {
      var n = p.options.length;
      at = (i % n + n) % n;
      var src = shot(p, at);
      img.hidden = !src;
      if (src) img.src = src;
      img.alt = p.options[at];
      var url = livePage(p, at);
      screen.classList.remove('ready');
      live.hidden = !url;
      live.src = url || 'about:blank';
      name.textContent = p.options[at];
      count.textContent = (at + 1) + ' of ' + n;
      shade.setAttribute('aria-label', p.options[at]);
      var bits = [];
      if (p.voted === at) bits.push('Your pick');
      if (p.counts && p.counts.length) {
        var total = p.counts.reduce(function (a, b) { return a + b; }, 0);
        bits.push((total ? Math.round(100 * (p.counts[at] || 0) / total) : 0) + '% of the votes');
      }
      note.textContent = bits.join(' \u00b7 ');
    }
    // The screen is a school Chromebook's, 1366 by 635, shrunk to fit.
    function fit() {
      var w = frame.offsetWidth, h = frame.offsetHeight;
      var s = Math.min(stage.clientWidth / w, stage.clientHeight / h, 1);
      fitBox.style.width = w * s + 'px';
      fitBox.style.height = h * s + 'px';
      frame.style.transform = 'scale(' + s + ')';
    }
    function shut() {
      shade.remove();
      window.removeEventListener('resize', fit);
      window.removeEventListener('keydown', onKey, true);
      if (back && back.focus) back.focus();
    }
    // Ahead of the pop-up's own keys, so Escape closes only this.
    function onKey(e) {
      if (e.key === 'Escape') shut();
      else if (e.key === 'ArrowLeft') show(at - 1);
      else if (e.key === 'ArrowRight') show(at + 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    close.addEventListener('click', shut);
    prev.addEventListener('click', function () { show(at - 1); });
    next.addEventListener('click', function () { show(at + 1); });
    choose.addEventListener('click', function () {
      var i = at;
      shut();
      pick(p, i);
    });
    shade.addEventListener('click', function (e) {
      if (e.target === shade || e.target === stage) shut();
    });
    show(start);
    document.body.appendChild(shade);
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('keydown', onKey, true);
    (pick ? choose : close).focus();
  }

  // ── The pop-up ────────────────────────────────────────────────────────

  function laterMap() {
    try { return JSON.parse(localStorage.getItem(LATER_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  function putOff(id) {
    var all = laterMap();
    all[id] = Date.now();
    try { localStorage.setItem(LATER_KEY, JSON.stringify(all)); } catch (e) {}
  }

  // Not over the first-visit question, and not over a game: it waits for
  // both to be out of the way.
  function whenFree(fn) {
    var tries = 0;
    (function check() {
      var busy = document.getElementById('gvCloakAsk')
        || document.querySelector('#gameOverlay.show')
        || document.querySelector('.gv-poll-pop');
      if (!busy) return fn();
      if (++tries < 600) setTimeout(check, 1000);
    }());
  }

  function pop(poll) {
    style();
    var shade = el('div', 'gv-poll-pop');
    shade.setAttribute('role', 'dialog');
    shade.setAttribute('aria-modal', 'true');
    shade.setAttribute('aria-label', 'New poll');
    var box = el('div', 'gv-poll-box');
    if (hasLooks(poll)) box.classList.add('wide');
    box.appendChild(el('div', 'gv-poll-kicker', poll.preview ? 'Preview poll \u00b7 localhost only' : 'New poll'));
    var foot = el('div', 'gv-poll-foot');
    var all = el('a', '', 'See all polls');
    all.href = '/polls/';
    var later = el('button', 'gv-poll-later', 'Not now');
    later.type = 'button';
    later.disabled = true;
    function close() {
      shade.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape' && !later.disabled) later.click();
    }
    later.addEventListener('click', function () {
      if (later.textContent === 'Not now') putOff(poll.id);
      close();
    });
    box.appendChild(card(poll, function () {
      // Voted: done straight away, no wait.
      later.textContent = 'Done';
      later.disabled = false;
      later.classList.add('on');
      later.focus();
      ask.count(-1);
    }));
    foot.appendChild(all);
    foot.appendChild(later);
    box.appendChild(foot);
    shade.appendChild(box);
    document.body.appendChild(shade);
    document.addEventListener('keydown', onKey);
    setTimeout(function () {
      later.disabled = false;
      later.classList.add('on');
    }, NOT_NOW_MS);
  }

  // Looks for a poll this browser or account has not answered and has not
  // put off in the last day, and asks it.
  var waiting = 0;
  function ask() {
    if (window.top !== window.self) return;
    visitor().then(function (v) {
      return rpc('gv_polls_open', { p_visitor: v });
    }).then(function (list) {
      var later = laterMap();
      var open = (list || []).filter(function (p) { return p.voted == null; });
      waiting = open.length;
      ask.count(0);
      var next = open.filter(function (p) { return !(later[p.id] && Date.now() - later[p.id] < LATER_MS); })[0];
      if (next) whenFree(function () { pop(next); });
    }).catch(function () {});
  }
  // The Polls card on the home page says how many are waiting.
  ask.count = function (change) {
    waiting = Math.max(0, waiting + change);
    if (window.GV && GV.features) GV.features.set('polls', waiting ? plural(waiting, 'poll', 'polls') + ' to answer' : null);
  };

  window.GV = window.GV || {};
  window.GV.polls = {
    ask: ask,
    card: card,
    use: use,
    rpc: rpc,
    visitor: visitor
  };
}());

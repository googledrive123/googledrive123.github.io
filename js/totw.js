/* GameVault Track of the Week: the weekly PolyTrack challenge as a card, with
   the track, who leads, a countdown to the end of Sunday, and the way in.
   Fills any element with a data-totw attribute, and stays hidden when no
   track is set this week. The full board is /challenge/.
   Used by index.html and leaderboard/index.html.
   Public surface: window.GV.totw.mount(container). */
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  // Where supabase-js keeps the session, so a signed-in player sees their own
  // place on the board.
  var TOKEN_KEY = 'sb-dxwjxzmlezfyursysays-auth-token';
  // A page left open still picks up new times and a new week.
  var REFRESH_MS = 60 * 1000;

  // The flag and the glow loop slowly on purpose. Anything near 3Hz is a
  // seizure risk and reads as an ad.
  var CSS =
    '.gv-totw{position:relative;overflow:hidden;margin:28px auto 0;max-width:620px;text-align:left;' +
      'background:var(--surface);border:1px solid var(--border-strong);border-radius:12px;' +
      'animation:gvTotwGlow 2.6s ease-in-out infinite}' +
    '.gv-totw[hidden]{display:none}' +
    '.gv-totw::after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:40%;pointer-events:none;' +
      'background:linear-gradient(100deg,transparent,rgba(255,255,255,.07),transparent);' +
      'animation:gvTotwSheen 5s ease-in-out infinite}' +
    '.gv-totw-flag{height:8px;opacity:.22;' +
      'background:repeating-conic-gradient(var(--text) 0 25%,transparent 0 50%) 0 0/8px 8px;' +
      'animation:gvTotwFlag 4s linear infinite}' +
    '.gv-totw-body{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px 18px;padding:14px 16px 16px}' +
    '.gv-totw-main{flex:1 1 260px;min-width:0}' +
    '.gv-totw-kicker{display:inline-flex;align-items:center;gap:7px;font-size:10.5px;font-weight:700;' +
      'letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}' +
    '.gv-totw-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent);' +
      'animation:gvTotwDot 1.6s ease-in-out infinite}' +
    '.gv-totw-title{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:6px}' +
    '.gv-totw-name{font-size:clamp(1.5rem,5vw,2rem);font-weight:700;letter-spacing:-.02em;line-height:1.1;' +
      'color:var(--text);overflow-wrap:anywhere}' +
    '.gv-totw-env{font-size:10.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;' +
      'border:1px solid var(--border-strong);border-radius:999px;color:var(--muted)}' +
    '.gv-totw-env.summer{color:#5ce08a;border-color:rgba(92,224,138,.45)}' +
    '.gv-totw-env.winter{color:#6aa8ff;border-color:rgba(106,168,255,.45)}' +
    '.gv-totw-env.desert{color:#f0c04a;border-color:rgba(240,192,74,.45)}' +
    '.gv-totw-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px;margin-top:8px;font-size:12.5px;color:var(--muted)}' +
    '.gv-totw-meta b{color:var(--text);font-weight:600}' +
    '.gv-totw-lead{display:inline-flex;align-items:center;gap:6px;min-width:0}' +
    '.gv-totw-lead svg{width:14px;height:14px;color:#f0c04a;flex-shrink:0}' +
    '.gv-totw-time{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--text)}' +
    '.gv-totw-you{color:var(--accent);font-weight:600}' +
    '.gv-totw-side{display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex:0 0 auto}' +
    '.gv-totw-clock{display:flex;align-items:baseline;gap:7px}' +
    '.gv-totw-clock .lbl{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted-2)}' +
    '.gv-totw-clock .val{font-family:"JetBrains Mono",monospace;font-size:15px;font-weight:600;color:var(--text);' +
      'font-variant-numeric:tabular-nums}' +
    '.gv-totw-clock.soon .val{color:var(--accent)}' +
    '.gv-totw-actions{display:flex;gap:8px}' +
    '.gv-totw a.gv-totw-race,.gv-totw a.gv-totw-board{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;' +
      'border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap}' +
    '.gv-totw a.gv-totw-race{background:var(--accent);border:1px solid var(--accent);color:#fff;' +
      'box-shadow:0 0 18px rgba(255,59,59,.35)}' +
    '.gv-totw a.gv-totw-race:hover{background:#ff5252;border-color:#ff5252}' +
    '.gv-totw a.gv-totw-race .arrow{display:inline-block;transition:transform .2s}' +
    '.gv-totw a.gv-totw-race:hover .arrow{transform:translateX(3px)}' +
    '.gv-totw a.gv-totw-board{border:1px solid var(--border-strong);color:var(--text);background:transparent}' +
    '.gv-totw a.gv-totw-board:hover{background:var(--surface-2)}' +
    '@media (max-width:520px){.gv-totw-side{align-items:stretch;flex:1 1 100%}' +
      '.gv-totw-actions a{flex:1;justify-content:center}}' +
    '@keyframes gvTotwGlow{0%,100%{border-color:var(--border-strong);box-shadow:0 0 0 0 rgba(255,59,59,0)}' +
      '50%{border-color:var(--accent);box-shadow:0 0 22px 0 rgba(255,59,59,.3)}}' +
    '@keyframes gvTotwSheen{0%,55%{left:-60%}100%{left:130%}}' +
    '@keyframes gvTotwFlag{to{background-position:32px 0}}' +
    '@keyframes gvTotwDot{0%,100%{opacity:1}50%{opacity:.35}}' +
    '@media (prefers-reduced-motion:reduce){.gv-totw,.gv-totw::after,.gv-totw-flag,.gv-totw-dot{animation:none}}';

  var CROWN = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>';

  function style() {
    if (document.getElementById('gvTotwCss')) return;
    var st = document.createElement('style');
    st.id = 'gvTotwCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function two(n) { return n < 10 ? '0' + n : String(n); }

  function token() {
    try {
      var s = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      return s && s.access_token && (!s.expires_at || s.expires_at * 1000 > Date.now() + 30000) ? s.access_token : null;
    } catch (e) { return null; }
  }

  function visitorId() {
    var gv = window.GV && window.GV.identity;
    return gv ? gv.ready.then(function () { return gv.id(); }, function () { return null; }) : Promise.resolve(null);
  }

  // A token the server refuses is asked again as a guest, which still gets
  // the track and the leader.
  function load() {
    return visitorId().then(function (vid) {
      var ask = function (bearer) {
        return fetch(SUPA_URL + '/rest/v1/rpc/gv_challenge_current', {
          method: 'POST',
          headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + (bearer || SUPA_KEY), 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_visitor_id: vid })
        });
      };
      var t = token();
      return ask(t).then(function (res) { return res.status === 401 && t ? ask(null) : res; });
    }).then(function (res) {
      if (!res.ok) throw new Error('challenge ' + res.status);
      return res.json();
    });
  }

  var boxes = [];
  var data = null;
  var skew = 0;
  var loadedAt = 0;
  var loading = false;

  function paint() {
    var c = data && data.challenge;
    boxes.forEach(function (box) {
      box.hidden = !c;
      if (!c) return;
      var kind = /^(Summer|Winter|Desert)\b/.exec(c.title);
      var lead = (data.top || [])[0];
      var you = data.you;
      box.innerHTML =
        '<div class="gv-totw-flag" aria-hidden="true"></div>' +
        '<div class="gv-totw-body">' +
          '<div class="gv-totw-main">' +
            '<div class="gv-totw-kicker"><span class="gv-totw-dot"></span>Track of the week · PolyTrack</div>' +
            '<div class="gv-totw-title"><span class="gv-totw-name">' + esc(c.title) + '</span>' +
              (kind ? '<span class="gv-totw-env ' + kind[1].toLowerCase() + '">' + kind[1] + '</span>' : '') + '</div>' +
            '<div class="gv-totw-meta">' +
              (lead
                ? '<span class="gv-totw-lead">' + CROWN + 'Leader <b>' + esc(lead.nickname) + '</b> <span class="gv-totw-time">' + esc(lead.time) + '</span></span>'
                : '<span>No times yet. Be the first.</span>') +
              '<span>' + Number(c.runners || 0).toLocaleString() + (c.runners === 1 ? ' racer' : ' racers') + '</span>' +
              (you ? '<span class="gv-totw-you">You #' + you.rank + ' · <span class="gv-totw-time">' + esc(you.time) + '</span></span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="gv-totw-side">' +
            '<div class="gv-totw-clock" role="timer" aria-label="Time left this week"><span class="lbl">ends in</span><span class="val"></span></div>' +
            '<div class="gv-totw-actions">' +
              '<a class="gv-totw-race" href="/games/polytrack">Race now <span class="arrow">→</span></a>' +
              '<a class="gv-totw-board" href="/challenge/">Leaderboard</a>' +
            '</div>' +
          '</div>' +
        '</div>';
    });
    tick();
  }

  // Server time, not the device's, so a wrong clock on a school laptop does
  // not move the finish line.
  function tick() {
    var c = data && data.challenge;
    if (!c) return;
    var left = Math.max(0, Date.parse(c.ends_at) - (Date.now() + skew));
    var s = Math.floor(left / 1000);
    var d = Math.floor(s / 86400);
    var text = (d ? d + 'd ' : '') + two(Math.floor(s / 3600) % 24) + ':' + two(Math.floor(s / 60) % 60) + ':' + two(s % 60);
    boxes.forEach(function (box) {
      var clock = box.querySelector('.gv-totw-clock');
      if (!clock) return;
      clock.querySelector('.val').textContent = text;
      clock.classList.toggle('soon', left < 6 * 3600 * 1000);
    });
    // The week is over, so ask for the next one.
    if (left <= 0 && Date.now() - loadedAt > 5000) refresh(true);
  }

  function refresh(force) {
    if (loading || (!force && Date.now() - loadedAt < REFRESH_MS)) return;
    loading = true;
    load().then(function (r) {
      loading = false;
      loadedAt = Date.now();
      skew = Date.parse(r.now) - Date.now() || 0;
      data = r;
      paint();
    }).catch(function (err) {
      loading = false;
      loadedAt = Date.now();
      console.error('[totw]', err);
    });
  }

  function mount(container) {
    if (!container || boxes.indexOf(container) >= 0) return;
    style();
    container.classList.add('gv-totw');
    container.hidden = true;
    boxes.push(container);
    if (data) paint();
    else refresh(true);
  }

  window.GV = window.GV || {};
  window.GV.totw = { mount: mount };

  function start() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-totw]'), mount);
    setInterval(tick, 1000);
    setInterval(function () { if (!document.hidden) refresh(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

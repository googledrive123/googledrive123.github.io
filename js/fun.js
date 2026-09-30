/* GameVault seasonal fun: April Fools pranks, Halloween decorations and a
   secret corner that opens /secret/.
   Runs on the home page and on every subpage, so it looks for what is there
   (the game grid, the game overlay, a header) and skips what is not. Outside
   April 1 and late October it adds one invisible link and nothing that runs
   on its own: no timers, no observers, no styles.
   Public surface: window.GV.fun. */
(function () {
  'use strict';

  var PRANKS_KEY = 'gv.fun.pranks';     // 'off' once someone turns pranks off
  var SEASONAL_KEY = 'gv.fun.seasonal'; // 'off' once someone turns decorations off

  function read(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function write(k, v) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) {}
  }

  // ?fun=april or ?fun=halloween shows that mode for this page load only.
  // Read now, before anything on the page tidies the address bar.
  var forced = '';
  try { forced = new URLSearchParams(location.search).get('fun') || ''; } catch (e) {}

  function isAprilFools() {
    if (forced === 'april') return true;
    var d = new Date();
    return d.getMonth() === 3 && d.getDate() === 1;
  }

  // October 20 through November 1, both counted, in the visitor's own time.
  function isHalloween() {
    if (forced === 'halloween') return true;
    var d = new Date(), m = d.getMonth(), day = d.getDate();
    return (m === 9 && day >= 20) || (m === 10 && day === 1);
  }

  // ── Modes ───────────────────────────────────────────────────────────────
  // Each running mode keeps a list of undo steps, so switching it off takes
  // back every node, listener and timer it added.

  var modes = {};

  function run(name, start) {
    if (modes[name]) return false;
    modes[name] = [];
    try { start(modes[name]); } catch (e) {}
    return true;
  }

  function halt(name) {
    var undo = modes[name];
    if (!undo) return false;
    delete modes[name];
    while (undo.length) { try { undo.pop()(); } catch (e) {} }
    return true;
  }

  function place(undo, el, parent) {
    (parent || document.body).appendChild(el);
    undo.push(function () { if (el.parentNode) el.parentNode.removeChild(el); });
    return el;
  }

  function listen(undo, target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    undo.push(function () { target.removeEventListener(type, fn, opts); });
  }

  function later(undo, fn, ms) {
    var id = setTimeout(fn, ms);
    undo.push(function () { clearTimeout(id); });
  }

  function flag(undo, cls) {
    document.documentElement.classList.add(cls);
    undo.push(function () { document.documentElement.classList.remove(cls); });
  }

  // ── Styles ──────────────────────────────────────────────────────────────
  // One sheet, added the first time a mode starts and then left alone. Every
  // rule hangs off a class on <html>, so it matches nothing once a mode ends.

  var SILLY = '"Comic Sans MS","Comic Neue","Chalkboard SE","Comic Sans","Marker Felt",cursive';

  var CSS = [
    // April Fools: a crooked header, a backwards logo and silly headings.
    'html.gv-fun-april .header,html.gv-fun-april .site-header,html.gv-fun-april .welcome-top{',
    'transform:rotate(-1deg);transform-origin:50% 0}',
    'html.gv-fun-april .logo-mark,html.gv-fun-april .site-brand .mark{transform:scaleX(-1)}',
    'html.gv-fun-april h1,html.gv-fun-april h2,html.gv-fun-april h3{font-family:' + SILLY + '}',

    // The way out. Under the game overlay and every dialog, above the page.
    '.gv-fun-chip{position:fixed;left:16px;bottom:16px;z-index:450;display:inline-flex;align-items:center;gap:0.55rem;',
    'padding:0.5rem 0.9rem;border-radius:100px;border:1px solid var(--border-strong,rgba(255,255,255,0.16));',
    'background:var(--surface,#121216);color:var(--text,#f4f4f6);cursor:pointer;',
    'font:500 0.8rem/1 "Space Grotesk",system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.45)}',
    '.gv-fun-chip:hover{border-color:var(--accent,#ff3b3b)}',
    '.gv-fun-chip:focus-visible{outline:2px solid var(--accent,#ff3b3b);outline-offset:2px}',
    '.gv-fun-chip b{font:600 0.6rem/1 "JetBrains Mono",monospace;letter-spacing:0.14em;text-transform:uppercase;',
    'color:var(--accent,#ff3b3b)}',
    'body.gv-playing .gv-fun-chip{bottom:82px}',

    // Shy tiles: the page's own tile transitions, plus a quick one for the dodge.
    'html.gv-fun-april .tile{transition:transform 0.2s cubic-bezier(0.2,0.8,0.2,1),box-shadow 0.25s,',
    'border-color 0.2s,translate 0.12s ease-out}',

    // The homework toast sits under the header, clear of the chip and the music bar.
    '.gv-fun-toast{position:fixed;left:50%;top:80px;z-index:450;transform:translateX(-50%);',
    'width:min(320px,calc(100vw - 32px));padding:0.8rem 1rem;border-radius:12px;',
    'border:1px solid var(--border-strong,rgba(255,255,255,0.16));background:var(--surface,#121216);',
    'color:var(--text,#f4f4f6);font:500 0.85rem/1.4 "Space Grotesk",system-ui,sans-serif;',
    'box-shadow:0 12px 32px rgba(0,0,0,0.5);transition:opacity 0.4s}',
    '.gv-fun-toast.out{opacity:0}',
    '.gv-fun-toast-bar{display:block;height:4px;margin-top:0.6rem;border-radius:2px;overflow:hidden;',
    'background:var(--surface-2,#1a1a20)}',
    '.gv-fun-toast-bar i{display:block;height:100%;width:99%;background:var(--accent,#ff3b3b);',
    'animation:gvFunLoad 3.2s cubic-bezier(0.1,0.7,0.2,1) both}',
    '.gv-fun-toast.done .gv-fun-toast-bar{display:none}',
    '@keyframes gvFunLoad{from{width:0}to{width:99%}}',

    // Upside-down player. Only the game turns; the bar and its Back button stay put.
    '#gameOverlay.gv-fun-flipped .game-frame-wrap{transform:rotate(180deg)}',
    '.gv-fun-flipback{position:absolute;left:50%;bottom:24px;z-index:5;transform:translateX(-50%);',
    'padding:0.75rem 1.4rem;border-radius:100px;border:0;background:var(--accent,#ff3b3b);color:#fff;cursor:pointer;',
    'font:600 0.92rem/1 "Space Grotesk",system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,0.55)}',
    '.gv-fun-flipback:focus-visible{outline:2px solid #fff;outline-offset:3px}',
    '.gv-fun-flipback[hidden]{display:none}',

    // Halloween: the accent warms toward pumpkin and a low orange glow rises
    // behind the page, above the backdrop layers and below everything else.
    'html.gv-fun-halloween{--accent:#ff5a1f}',
    '.gv-fun-glow{position:fixed;inset:0;z-index:-1;pointer-events:none;',
    'background:radial-gradient(ellipse 75% 45% at 50% 100%,rgba(255,110,30,0.16),transparent 70%),',
    'radial-gradient(ellipse 40% 30% at 0 0,rgba(255,110,30,0.06),transparent 70%),',
    'radial-gradient(ellipse 40% 30% at 100% 0,rgba(255,110,30,0.06),transparent 70%)}',

    // Decorations share one layer: never catches a click, under the game and dialogs.
    '.gv-fun-spooky{position:fixed;inset:0;z-index:450;pointer-events:none;overflow:hidden}',
    '.gv-fun-web{position:absolute;top:0;width:150px;height:150px;color:rgba(255,255,255,0.2)}',
    '.gv-fun-web-left{left:0}',
    '.gv-fun-web-right{right:0;transform:scaleX(-1)}',
    '@media (max-width:640px){.gv-fun-web{width:96px;height:96px}}'
  ];

  function styles() {
    if (document.getElementById('gv-fun-css')) return;
    var s = document.createElement('style');
    s.id = 'gv-fun-css';
    s.textContent = CSS.join('');
    (document.head || document.documentElement).appendChild(s);
  }

  // ── April Fools ─────────────────────────────────────────────────────────

  // On screen the whole time pranks run, so nobody has to hunt for the way out.
  function offChip(undo) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'gv-fun-chip';
    b.innerHTML = '<b>April Fools</b>Turn off pranks';
    b.addEventListener('click', function () { setPranks(false); });
    place(undo, b);
  }

  var TOAST_SEEN = 'gv.fun.homework'; // sessionStorage

  // A progress toast that gives itself up at 99%. Once per tab, so clicking
  // through pages on April 1 does not bring it back every time.
  function homeworkToast(undo) {
    try {
      if (sessionStorage.getItem(TOAST_SEEN)) return;
      sessionStorage.setItem(TOAST_SEEN, '1');
    } catch (e) {}
    var t = document.createElement('div');
    t.className = 'gv-fun-toast';
    t.setAttribute('role', 'status');
    t.innerHTML = '<span class="gv-fun-toast-text">Loading your homework…</span>' +
      '<span class="gv-fun-toast-bar"><i></i></span>';
    later(undo, function () {
      place(undo, t);
      later(undo, function () {
        t.querySelector('.gv-fun-toast-text').textContent = 'Just kidding. Happy April Fools!';
        t.classList.add('done');
      }, 3400);
      later(undo, function () { t.classList.add('out'); }, 6400);
      later(undo, function () { if (t.parentNode) t.parentNode.removeChild(t); }, 6900);
    }, 1200);
  }

  // Tiles slide a few px away from the mouse but never out from under it, so
  // a click still lands on the tile it was aimed at. Touch is left alone: a
  // finger has nothing to dodge until it has already tapped.
  function shyTiles(undo) {
    if (!document.getElementById('grid') && !document.querySelector('.tile')) return;
    var MAX = 10, EDGE = 6;
    var tile = null, x = 0, y = 0, frame = 0;

    function settle() {
      if (tile) tile.style.translate = '';
      tile = null;
    }

    // How far to move along one axis: nothing at the middle, nothing at the
    // edge, and never so far that the pointer ends up off the tile.
    function push(d, half) {
      var dist = Math.abs(d);
      var p = Math.min(MAX * dist / half, half - dist - EDGE);
      return p > 0 ? (d < 0 ? -p : p) : 0;
    }

    function step() {
      frame = 0;
      if (!tile || !tile.isConnected) { tile = null; return; }
      var r = tile.getBoundingClientRect();
      // Measure from where the tile sits at rest, not where it has dodged to.
      var now = String(getComputedStyle(tile).translate || '').split(' ');
      var nx = parseFloat(now[0]) || 0, ny = parseFloat(now[1]) || 0;
      var hw = r.width / 2, hh = r.height / 2;
      var dx = push(r.left + hw - nx - x, hw), dy = push(r.top + hh - ny - y, hh);
      tile.style.translate = dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px';
    }

    listen(undo, document, 'pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var t = e.target && e.target.closest ? e.target.closest('.tile') : null;
      if (t && t.classList.contains('skeleton')) t = null;
      if (t !== tile) { settle(); tile = t; }
      if (!tile) return;
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(step);
    }, { passive: true });
    listen(undo, document.documentElement, 'mouseleave', settle);
    listen(undo, window, 'scroll', settle, { passive: true });
    undo.push(function () {
      if (frame) cancelAnimationFrame(frame);
      settle();
    });
  }

  // index.html owns opening and closing a game, so this watches the overlay's
  // class for 'show' instead of hooking the code that sets it.
  function flipPlayer(undo) {
    var overlay = document.getElementById('gameOverlay');
    if (!overlay || !window.MutationObserver) return;
    var open = overlay.classList.contains('show');

    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'gv-fun-flipback';
    back.textContent = 'Flip it back';
    back.hidden = true;
    back.addEventListener('click', unflip);
    place(undo, back, overlay);

    function unflip() {
      overlay.classList.remove('gv-fun-flipped');
      back.hidden = true;
    }

    var watch = new MutationObserver(function () {
      var now = overlay.classList.contains('show');
      if (now === open) return; // our own class change, or nothing that matters
      open = now;
      if (now && Math.random() < 0.3) {
        overlay.classList.add('gv-fun-flipped');
        back.hidden = false;
      } else {
        unflip();
      }
    });
    watch.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    undo.push(function () { watch.disconnect(); unflip(); });
  }

  function startApril(undo) {
    styles();
    flag(undo, 'gv-fun-april');
    offChip(undo);
    shyTiles(undo);
    homeworkToast(undo);
    flipPlayer(undo);
  }

  // ── Halloween ───────────────────────────────────────────────────────────

  // A cobweb spun out from the top left corner. The right hand one is the
  // same drawing, mirrored in CSS.
  function cobweb(side) {
    var R = 150, spokes = [0, 16, 34, 52, 71, 90], rings = [30, 58, 90, 124];
    function pt(r, deg) {
      var a = deg * Math.PI / 180;
      return (r * Math.cos(a)).toFixed(1) + ' ' + (r * Math.sin(a)).toFixed(1);
    }
    var d = '';
    spokes.forEach(function (s) { d += 'M0 0L' + pt(R, s); });
    rings.forEach(function (r) {
      for (var i = 1; i < spokes.length; i++) {
        var a = spokes[i - 1], b = spokes[i];
        // Each thread sags a little toward the corner between two spokes.
        d += 'M' + pt(r, a) + 'Q' + pt(r * 0.84, (a + b) / 2) + ' ' + pt(r, b);
      }
    });
    return '<svg class="gv-fun-web gv-fun-web-' + side + '" viewBox="0 0 150 150">' +
      '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>';
  }

  function startHalloween(undo) {
    styles();
    flag(undo, 'gv-fun-halloween');
    var glow = document.createElement('div');
    glow.className = 'gv-fun-glow';
    glow.setAttribute('aria-hidden', 'true');
    place(undo, glow);

    var layer = document.createElement('div');
    layer.className = 'gv-fun-spooky';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = cobweb('left') + cobweb('right');
    place(undo, layer);
  }

  // ── Secret corner ───────────────────────────────────────────────────────
  // Out of the tab order on purpose: it is there to be found by poking about.
  // Under the game overlay, so a click in a game's corner stays in the game.

  function secretCorner() {
    if (!document.body || document.querySelector('.gv-fun-secret')) return;
    var a = document.createElement('a');
    a.className = 'gv-fun-secret';
    a.href = '/secret/';
    a.tabIndex = -1;
    a.setAttribute('aria-label', 'Secret');
    // Inline, so an ordinary day needs no stylesheet at all.
    a.style.cssText = 'position:fixed;top:0;right:0;width:14px;height:14px;' +
      'z-index:460;display:block;background:transparent;outline:none';
    document.body.appendChild(a);
  }

  // ── Switches ────────────────────────────────────────────────────────────

  function pranksOn() { return read(PRANKS_KEY) !== 'off'; }
  function seasonalOn() { return read(SEASONAL_KEY) !== 'off'; }

  // A forced mode wins over the switch, so a test link always shows something.
  function aprilWanted() { return forced === 'april' || (pranksOn() && isAprilFools()); }
  function halloweenWanted() { return forced === 'halloween' || (seasonalOn() && isHalloween()); }

  function apply() {
    var changed = aprilWanted() ? run('april', startApril) : halt('april');
    changed = (halloweenWanted() ? run('halloween', startHalloween) : halt('halloween')) || changed;
    if (changed) { try { document.dispatchEvent(new CustomEvent('gv:fun')); } catch (e) {} }
  }

  function setPranks(on) {
    write(PRANKS_KEY, on ? 'on' : 'off');
    if (!on && forced === 'april') forced = '';
    apply();
  }

  function setSeasonal(on) {
    write(SEASONAL_KEY, on ? 'on' : 'off');
    if (!on && forced === 'halloween') forced = '';
    apply();
  }

  function boot() {
    secretCorner();
    apply();
    // Switches flipped in another tab, the secret menu say, land here too.
    window.addEventListener('storage', function (e) {
      if (e.key === null || String(e.key).indexOf('gv.fun.') === 0) apply();
    });
  }

  window.GV = window.GV || {};
  window.GV.fun = {
    pranksOn: pranksOn,
    setPranks: setPranks,
    seasonalOn: seasonalOn,
    setSeasonal: setSeasonal,
    isAprilFools: isAprilFools,
    isHalloween: isHalloween
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

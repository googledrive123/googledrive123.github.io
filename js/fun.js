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
    'html.gv-fun-april h1,html.gv-fun-april h2,html.gv-fun-april h3{font-family:' + SILLY + '}'
  ];

  function styles() {
    if (document.getElementById('gv-fun-css')) return;
    var s = document.createElement('style');
    s.id = 'gv-fun-css';
    s.textContent = CSS.join('');
    (document.head || document.documentElement).appendChild(s);
  }

  // ── April Fools ─────────────────────────────────────────────────────────

  function startApril(undo) {
    styles();
    flag(undo, 'gv-fun-april');
  }

  // ── Halloween ───────────────────────────────────────────────────────────

  function startHalloween(undo) {
    styles();
    flag(undo, 'gv-fun-halloween');
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

// The GameVault account strip and settings page inside PolyTrack.
//
// The game has no idea the site around it has accounts, and its own menu has
// nowhere to say who is playing. Without that, a board full of "Anonymous" is
// the only answer a player ever gets to "which one of these is me".
//
// Like leaderboard.js, this stays outside main.bundle.js: it waits for the
// game to build its menu and then adds to it, so the bundle is still exactly
// what Kodub shipped and a newer PolyTrack drops straight in.
//
// Reads and writes js/identity.js. Everything it shows comes from there.
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  var AUTH_KEY = 'sb-dxwjxzmlezfyursysays-auth-token';

  function identity() {
    return (window.GV && window.GV.identity) || null;
  }

  function session() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function signedIn() {
    var s = session();
    return !!(s && s.access_token);
  }

  // The site writes the username into the identity module as it signs in, so
  // most of the time it is already here. It is fetched only when the game was
  // opened straight from its own URL and that never happened.
  function loadAccountName() {
    var gv = identity();
    var s = session();
    if (!gv || !s || !s.access_token || !s.user || !s.user.id) return;
    if (gv.accountName()) return;
    fetch(SUPA_URL + '/rest/v1/profiles?select=username&id=eq.' + encodeURIComponent(s.user.id), {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + s.access_token }
    }).then(function (res) {
      return res.ok ? res.json() : null;
    }).then(function (rows) {
      if (rows && rows[0] && rows[0].username) gv.setAccountName(rows[0].username);
    }).catch(function () {});
  }

  // ── Styles ────────────────────────────────────────────────────────────
  // Built out of the game's own custom properties so the panel is the same
  // furniture as the rest of the menu rather than a web page bolted onto it.

  var STYLE_ID = 'gv-account-style';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = [
      // The button row is a flex row that centres its 200px buttons, so the
      // middle of the container is the middle of a button and 116px below it
      // clears the row whatever height the menu happens to be.
      '.menu-ui > .main-buttons-container { position: relative; }',
      '.gv-whoami {',
      '  position: absolute; left: 0; right: 0; top: calc(50% + 116px);',
      '  margin: 0; padding: 6px 14px; border: none; background: none;',
      '  font: inherit; font-size: 24px; color: var(--text-color);',
      '  text-align: center; cursor: pointer; pointer-events: auto; }',
      '.gv-whoami > .gv-who-label { opacity: 0.5; }',
      '.gv-whoami > .gv-who-name { margin-left: 8px; }',
      '.gv-whoami:hover > .gv-who-name { text-decoration: underline; }',

      '.gv-panel {',
      '  position: absolute; left: 0; top: 0; z-index: 3;',
      '  width: 100%; height: 100%; display: flex;',
      '  align-items: center; justify-content: center;',
      '  background-color: rgba(20, 20, 30, 0.6); pointer-events: auto; }',
      '.gv-panel > .gv-box {',
      '  width: 700px; max-width: 92%; display: flex; flex-direction: column;',
      '  text-align: left; background-color: var(--surface-color); }',
      '.gv-panel h2 {',
      '  margin: 10px; padding: 4px; font-weight: normal; font-size: 30px;',
      '  color: var(--text-color); }',
      '.gv-panel > .gv-box > .gv-body {',
      '  margin: 0; padding: 4px 0;',
      '  background-color: var(--surface-secondary-color); }',
      '.gv-panel .gv-setting { margin: 10px; display: flex; align-items: center; }',
      '.gv-panel .gv-setting > p {',
      '  margin: 0; padding: 4px; flex-grow: 1; font-size: 24px;',
      '  color: var(--text-color); }',
      '.gv-panel .gv-note {',
      '  margin: 0 14px 10px 14px; padding: 0; font-size: 18px;',
      '  line-height: 1.3; color: var(--text-color); opacity: 0.5; }',
      '.gv-panel input.gv-name {',
      '  margin: 0; padding: 8px 12px; width: 320px; max-width: 50%;',
      '  box-sizing: border-box; border: none; font: inherit; font-size: 24px;',
      '  color: var(--text-color); background-color: var(--button-color);',
      '  pointer-events: auto; }',
      '.gv-panel input.gv-name:disabled { color: var(--text-disabled-color); }',
      '.gv-panel .gv-toggle > button { font-size: 24px; }',
      '.gv-panel .gv-toggle > button.selected {',
      '  background-color: var(--button-hover-color); }',
      '.gv-panel > .gv-box > .gv-foot { margin: 10px; }'
    ].join('\n');
    document.head.appendChild(css);
  }

  // ── The strip under the menu buttons ──────────────────────────────────

  function labelFor() {
    if (signedIn()) return 'Signed in as';
    return 'Playing as';
  }

  function paintStrip(strip) {
    var gv = identity();
    if (!gv) return;
    strip.querySelector('.gv-who-label').textContent = labelFor();
    strip.querySelector('.gv-who-name').textContent = gv.realName();
    strip.title = gv.anonymous()
      ? 'Anonymous mode is on. Other players see "Anonymous" on the leaderboard.'
      : 'This is the name other players see on the leaderboard.';
  }

  function ensureStrip(menu) {
    var buttons = menu.querySelector('.main-buttons-container');
    if (!buttons || buttons.querySelector('.gv-whoami')) return;
    var strip = document.createElement('button');
    strip.type = 'button';
    strip.className = 'gv-whoami';
    strip.innerHTML = '<span class="gv-who-label"></span><span class="gv-who-name"></span>';
    strip.addEventListener('click', function () { openPanel(menu); });
    buttons.appendChild(strip);
    paintStrip(strip);
  }

  function repaintStrips() {
    var strips = document.querySelectorAll('.gv-whoami');
    for (var i = 0; i < strips.length; i++) paintStrip(strips[i]);
  }

  // ── The settings page ─────────────────────────────────────────────────

  function setting(labelText, control) {
    var row = document.createElement('div');
    row.className = 'gv-setting';
    var label = document.createElement('p');
    label.textContent = labelText;
    row.appendChild(label);
    row.appendChild(control);
    return row;
  }

  function note(text) {
    var p = document.createElement('p');
    p.className = 'gv-note';
    p.textContent = text;
    return p;
  }

  function nameField(gv) {
    var input = document.createElement('input');
    input.className = 'gv-name';
    input.type = 'text';
    input.maxLength = 32;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.value = gv.realName();
    // A signed-in player already has a name the whole site knows them by, and
    // two places to change it is one too many.
    input.disabled = signedIn();
    input.addEventListener('input', function () {
      gv.setChosenName(input.value);
    });
    // An empty field is not a name. Falling back to the generated one is
    // better than letting somebody race as nothing at all.
    input.addEventListener('blur', function () {
      if (!input.value.trim()) input.value = gv.realName();
    });
    return input;
  }

  function anonymousToggle(gv) {
    var wrap = document.createElement('div');
    wrap.className = 'gv-toggle';
    var off = document.createElement('button');
    var on = document.createElement('button');
    off.className = 'button';
    on.className = 'button';
    off.textContent = 'Off';
    on.textContent = 'On';
    function paint() {
      off.classList.toggle('selected', !gv.anonymous());
      on.classList.toggle('selected', gv.anonymous());
    }
    off.addEventListener('click', function () { gv.setAnonymous(false); paint(); });
    on.addEventListener('click', function () { gv.setAnonymous(true); paint(); });
    paint();
    wrap.appendChild(off);
    wrap.appendChild(on);
    return wrap;
  }

  function openPanel(menu) {
    var gv = identity();
    if (!gv || menu.querySelector('.gv-panel')) return;

    var panel = document.createElement('div');
    panel.className = 'gv-panel';

    var box = document.createElement('div');
    box.className = 'gv-box';

    var title = document.createElement('h2');
    title.textContent = 'GameVault account';
    box.appendChild(title);

    var body = document.createElement('div');
    body.className = 'gv-body';
    body.appendChild(setting('Name', nameField(gv)));
    body.appendChild(note(signedIn()
      ? 'Your GameVault username. Change it from your profile on the site.'
      : 'Picked for this browser. Change it to anything you like.'));
    body.appendChild(setting('Anonymous mode', anonymousToggle(gv)));
    body.appendChild(note('On, the leaderboard shows you as Anonymous to '
      + 'everyone else. Your own row still shows your name so you can find it.'));
    box.appendChild(body);

    var foot = document.createElement('div');
    foot.className = 'gv-foot';
    var back = document.createElement('button');
    back.className = 'button';
    back.innerHTML = '<img class="button-icon" src="images/back.svg">';
    back.appendChild(document.createTextNode(' Back'));
    back.addEventListener('click', function () { panel.remove(); });
    foot.appendChild(back);
    box.appendChild(foot);

    panel.appendChild(box);
    panel.addEventListener('click', function (e) {
      if (e.target === panel) panel.remove();
    });
    menu.appendChild(panel);
  }

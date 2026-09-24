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

  // ── The blue check ────────────────────────────────────────────────────
  // Handed out from the site's analytics dashboard. Asked by account and by
  // browser, the same way the site asks, and held as when it was given.

  var verifiedAt = null;

  function loadVerified() {
    var gv = identity();
    if (!gv) return;
    var s = session();
    var token = s && s.access_token;

    function ask(bearer) {
      return fetch(SUPA_URL + '/rest/v1/rpc/gv_verified_status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + (bearer || SUPA_KEY)
        },
        body: JSON.stringify({ p_visitor_id: gv.id() })
      });
    }

    // A token past its expiry is refused outright, and refreshing it is the
    // site's job. Asking again without it still finds a check given to this
    // browser, which is better than finding nothing.
    ask(token).then(function (res) {
      return res.ok || !token ? res : ask(null);
    }).then(function (res) {
      return res.ok ? res.json() : null;
    }).then(function (data) {
      verifiedAt = data && data.verified_at ? data.verified_at : null;
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
      // First line of the block the game already keeps under the buttons, so
      // it stacks with the game's own text instead of being positioned into
      // the same few pixels. That block is hidden whenever the menu moves off
      // its front screen, and the strip goes with it.
      '.menu-ui > .info > .gv-whoami {',
      '  display: block; margin: 0 auto 4px auto; padding: 2px 5px;',
      '  width: fit-content; border: none; background: none;',
      '  font: inherit; font-size: 24px; color: var(--text-color);',
      '  cursor: pointer; pointer-events: auto; }',
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

  // Returns true only when a strip was actually added, so the caller knows to
  // remeasure. This runs off a mutation observer that fires every frame during
  // a race, and remeasuring forces a reflow.
  function ensureStrip(menu) {
    var info = menu.querySelector(':scope > .info');
    if (!info || info.querySelector('.gv-whoami')) return false;
    var strip = document.createElement('button');
    strip.type = 'button';
    strip.className = 'gv-whoami';
    strip.innerHTML = '<span class="gv-who-label"></span><span class="gv-who-name"></span>';
    strip.addEventListener('click', function () { openPanel(menu); });
    info.insertBefore(strip, info.firstChild);
    paintStrip(strip);
    return true;
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
    foot.appendChild(back);
    box.appendChild(foot);

    panel.appendChild(box);

    // Escape closes the panel and goes no further: the game reads it too, and
    // would take the menu back a screen behind a panel that had already
    // answered the same key.
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close();
    }
    function close() {
      window.removeEventListener('keydown', onKey, true);
      panel.remove();
    }
    window.addEventListener('keydown', onKey, true);
    back.addEventListener('click', close);
    panel.addEventListener('click', function (e) { if (e.target === panel) close(); });

    menu.appendChild(panel);
  }

  // ── Making room ───────────────────────────────────────────────────────
  // PolyTrack's menu is 800 logical pixels tall at its shortest, and at that
  // size its own footer already sits on top of the button tiles before
  // anything of ours is added. A 1200x750 Chromebook lands exactly there, so
  // this is the common case rather than the edge one.
  //
  // The logo is 280 of those 800 pixels. It gives up whatever the strip needs
  // and nothing more, so a tall window still renders the menu the game ships.

  var LOGO_MARGIN = 80;    // the game's own values, restored when there is room
  var LOGO_HEIGHT = 200;
  var LOGO_MIN_MARGIN = 8;
  var LOGO_MIN_HEIGHT = 140;
  var CLEARANCE = 10;

  // Rects are in screen pixels and the game scales the whole interface down on
  // a small window, so they have to be divided back into the pixels the
  // stylesheet is written in.
  function uiScale() {
    var raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--ui-scale-factor');
    var n = parseFloat(raw);
    return n > 0 ? n : 1;
  }

  // False means the menu could not be measured yet, not that it needed
  // nothing. The caller uses that to decide whether to try again.
  function fitMenu(menu) {
    var logo = menu.querySelector(':scope > .logo');
    var tile = menu.querySelector(':scope > .main-buttons-container .button-image');
    var info = menu.querySelector(':scope > .info');
    if (!logo || !tile || !info) return false;

    logo.style.marginTop = '';
    logo.style.height = '';

    var tileBox = tile.getBoundingClientRect();
    var infoBox = info.getBoundingClientRect();
    // Mid-transition, or on a screen the menu is not currently showing. The
    // front page flickers through several of these while the game starts.
    if (!tileBox.height || !infoBox.height) return false;

    var scale = uiScale();
    var over = (tileBox.bottom / scale) + CLEARANCE - (infoBox.top / scale);
    if (over <= 0) return true;

    // The button container grows into whatever the logo gives up and then
    // re-centres its row inside itself, so the tiles only rise by half.
    var give = Math.ceil(over * 2);
    var margin = Math.max(LOGO_MIN_MARGIN, LOGO_MARGIN - give);
    give -= LOGO_MARGIN - margin;
    var height = Math.max(LOGO_MIN_HEIGHT, LOGO_HEIGHT - give);

    logo.style.marginTop = margin + 'px';
    logo.style.height = height + 'px';
    return true;
  }

  // The strip is often added while the menu is still behind a loading screen
  // or a sub-page, where everything measures zero. Rather than measure once
  // and hope, the fit is redone whenever the menu is visible and either the
  // window or the menu itself has changed since the last one.
  var fittedLogo = null;
  var fittedKey = null;

  function maybeFit(menu) {
    var logo = menu.querySelector(':scope > .logo');
    var info = menu.querySelector(':scope > .info');
    if (!logo || !info || info.offsetParent === null) return;
    var key = menu.offsetWidth + 'x' + menu.offsetHeight;
    if (logo === fittedLogo && key === fittedKey) return;
    if (!fitMenu(menu)) return;
    fittedLogo = logo;
    fittedKey = key;
  }

  // ── Wiring ────────────────────────────────────────────────────────────
  // The menu is rebuilt whenever the game returns to it, so the strip is put
  // back rather than assumed to have survived.

  function attach() {
    var menu = document.querySelector('.menu-ui');
    if (!menu) return;
    ensureStyles();
    ensureStrip(menu);
    maybeFit(menu);
  }

  var fitTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(fitTimer);
    // The game rescales the whole interface from its own resize listener.
    // Measuring before that lands reads the size that is on its way out.
    fitTimer = setTimeout(function () {
      var menu = document.querySelector('.menu-ui');
      if (menu) maybeFit(menu);
    }, 200);
  });

  function start() {
    var gv = identity();
    if (gv) {
      gv.onChange(repaintStrips);
      gv.ready.then(repaintStrips);
      gv.ready.then(loadVerified);
    }
    loadAccountName();
    // Class changes matter as much as new nodes here: the game moves between
    // menu screens by toggling "hidden", so the front page coming back is an
    // attribute change and nothing else. Watching only child lists meant the
    // menu was measured while it was still off screen and never again.
    new MutationObserver(attach).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class']
    });
    attach();
  }

  // Signing in happens on the page around the iframe, so it arrives here as a
  // storage event rather than as anything the game did.
  window.addEventListener('storage', function (e) {
    if (!e || (e.key !== AUTH_KEY && e.key !== 'gv.username')) return;
    loadAccountName();
    loadVerified();
    repaintStrips();
  });

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();

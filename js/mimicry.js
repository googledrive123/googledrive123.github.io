/**
 * GameVault tab cloaking + panic controls.
 *
 * Loaded by index.html, every page under /games/, and every standalone page.
 * One engine, one storage key (gv.cloak.v1) — before this, index.html and this
 * file each kept their own cloak, so picking Khan Academy on the homepage still
 * opened games in a Google Docs tab.
 *
 * Public surface: window.GV.cloak and window.GV.security.
 */
(function () {
  'use strict';

  var CLOAK_KEY = 'gv.cloak.v1';
  var DECISION_KEY = 'gv.cloak.asked.v1';
  var GA_MEASUREMENT_ID = 'G-KRH3X9QS3M';

  var DEFAULT_TITLE = 'GameVault';
  var DEFAULT_ICON = '/favicon.svg';

  /* Disguises. `custom: 'email'` means the title is built from the saved
     username/domain instead of being fixed. */
  var PRESETS = [
    { id: 'docs',      label: 'Google Docs',       title: 'Untitled document - Google Docs',              icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon9.ico' },
    { id: 'drive',     label: 'Google Drive',      title: 'My Drive - Google Drive',                      icon: 'https://www.gstatic.com/images/branding/productlogos/drive_2026/v1/web-96dp/logo_drive_2026_color_1x_web_96dp.png' },
    { id: 'sheets',    label: 'Google Sheets',     title: 'Untitled spreadsheet - Google Sheets',         icon: 'https://ssl.gstatic.com/docs/spreadsheets/favicon4.ico' },
    { id: 'slides',    label: 'Google Slides',     title: 'Untitled presentation - Google Slides',        icon: 'https://ssl.gstatic.com/docs/presentations/images/favicon7.ico' },
    { id: 'gmail',     label: 'Gmail',             title: 'Inbox - Gmail',                                icon: 'https://www.gstatic.com/images/branding/productlogos/gmail_2026/v1/web-96dp/logo_gmail_2026_color_1x_web_96dp.png', custom: 'email' },
    { id: 'classroom', label: 'Classroom',         title: 'Home - Google Classroom',                      icon: 'https://ssl.gstatic.com/classroom/favicon.png' },
    { id: 'google',    label: 'Google',            title: 'Google',                                       icon: '/icons/google-192.png' },
    { id: 'khan',      label: 'Khan Academy',      title: 'Khan Academy | Free Online Courses',           icon: 'https://cdn.kastatic.org/images/favicon.ico' },
    { id: 'canvas',    label: 'Canvas',            title: 'Dashboard | Canvas',                           icon: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico' },
    { id: 'schoology', label: 'Schoology',         title: 'Schoology',                                    icon: 'https://asset-cdn.schoology.com/sites/all/themes/schoology_theme/favicon.ico' },
    { id: 'desmos',    label: 'Desmos',            title: 'Desmos | Graphing Calculator',                 icon: 'https://www.desmos.com/assets/img/apps/graphing/favicon.ico' },
    { id: 'campus',    label: 'Infinite Campus',   title: 'Infinite Campus',                              icon: 'https://www.infinitecampus.com/favicon.ico' },
    { id: 'formative', label: 'Formative',         title: 'Formative',                                    icon: 'https://cdn.prod.website-files.com/605fdb6b57d00c47e806a2dd/6848851066d26403b2729ff8_Formative_Icon%201.png' },
    { id: 'clever',    label: 'Clever',            title: 'Clever | Portal',                              icon: 'https://www.clever.com/wp-content/uploads/2023/06/cropped-Favicon-512px-192x192.png' },
    { id: 'd203',      label: 'District 203',      title: 'Naperville Community Unit School District 203', icon: 'https://resources.finalsite.net/images/v1749062123/naperville203org/ufxikmfkxw1iykkgox5a/naperville-favicon.ico' }
  ];

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function drop(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  // ── Cloak ───────────────────────────────────────────────────────────────

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }

  function emailTitle() {
    var user = read('emailUsername', '');
    var domain = read('emailDomain', 'gmail.com') || 'gmail.com';
    return user ? 'Inbox - ' + user + '@' + domain + ' - Gmail' : 'Inbox - Gmail';
  }

  /* Older builds of this file stored the cloak under three separate keys.
     Fold those into gv.cloak.v1 once, then forget them. */
  function migrateLegacy() {
    var type = read('pageMimicType', null);
    var title = read('pageMimicTitle', null);
    var icon = read('pageMimicIcon', null);
    if (!type && !title && !icon) return;
    if (!read(CLOAK_KEY, null)) {
      write(CLOAK_KEY, JSON.stringify({ presetId: type || undefined, title: title || '', icon: icon || '' }));
      write(DECISION_KEY, 'yes');
    }
    drop('pageMimicType');
    drop('pageMimicTitle');
    drop('pageMimicIcon');
  }

  function current() {
    try {
      var raw = localStorage.getItem(CLOAK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* Chrome only reads an icon link that sits in <head>, and it is far more
     reliable about re-reading one when the element itself is replaced than
     when its href is edited in place. Drop every icon link, add one fresh.

     This used to just set .href on whatever link it found. index.html carried
     22 stray byte order marks in front of its doctype, which made the parser
     open <body> early and put the whole head — icon link included — inside it.
     The title still applied, the favicon silently did not. The marks are gone;
     rebuilding the link in <head> means a stray one cannot do it again. */
  function setFavicon(href) {
    var old = document.querySelectorAll("link[rel~='icon']");
    for (var i = 0; i < old.length; i++) {
      if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
    }
    var el = document.createElement('link');
    el.rel = 'icon';
    el.href = href;
    (document.head || document.documentElement).appendChild(el);
  }

  function paint(title, icon) {
    document.title = title || DEFAULT_TITLE;
    setFavicon(icon || DEFAULT_ICON);
  }

  function apply() {
    var c = current();
    if (!c) { paint(null, null); return; }
    var preset = c.presetId ? presetById(c.presetId) : null;
    // Gmail's title depends on the saved address, so rebuild it every load.
    var title = preset && preset.custom === 'email' ? emailTitle() : (c.title || (preset && preset.title));
    paint(title, c.icon || (preset && preset.icon));
  }

  function setPreset(id) {
    var p = presetById(id);
    if (!p) return;
    write(CLOAK_KEY, JSON.stringify({
      presetId: p.id,
      title: p.custom === 'email' ? emailTitle() : p.title,
      icon: p.icon
    }));
    write(DECISION_KEY, 'yes');
    apply();
  }

  function setCustom(title, icon) {
    if (!title) return;
    write(CLOAK_KEY, JSON.stringify({ title: title, icon: icon || '' }));
    write(DECISION_KEY, 'yes');
    apply();
  }

  function setEmail(user, domain) {
    write('emailUsername', (user || '').trim());
    write('emailDomain', (domain || 'gmail.com').trim() || 'gmail.com');
    var c = current();
    if (c && c.presetId === 'gmail') setPreset('gmail');
  }

  function reset() {
    drop(CLOAK_KEY);
    write(DECISION_KEY, 'yes');
    apply();
  }

  // ── Panic key and close confirmation ────────────────────────────────────

  function panicUrl() {
    var saved = (read('panicRedirectUrl', '') || '').trim();
    if (!saved) return 'https://classroom.google.com';
    return /^https?:\/\//i.test(saved) ? saved : 'https://' + saved;
  }

  function onPanicKey(e) {
    // Never fire while someone is typing — otherwise "[" in a search box bails.
    var t = e.target;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || ''))) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== read('panicKey', '[')) return;
    // Tell the close-confirmation to stand down for this navigation.
    try { sessionStorage.setItem('panicActivation', 'true'); } catch (err) {}
    window.location.replace(panicUrl());
  }

  function initPanicKey() {
    document.removeEventListener('keydown', onPanicKey);
    if (read('panicEnabled', 'true') !== 'false') {
      document.addEventListener('keydown', onPanicKey);
    }
  }

  function initClosePrevention() {
    window.onbeforeunload = null;
    if (read('verificationEnabled', 'false') !== 'true') return;
    window.onbeforeunload = function () {
      var panicking = false;
      try { panicking = sessionStorage.getItem('panicActivation') === 'true'; } catch (e) {}
      if (panicking) {
        try { sessionStorage.removeItem('panicActivation'); } catch (e) {}
        return undefined;
      }
      return 'Are you sure you want to leave this page?';
    };
  }

  function initSecurity() {
    initPanicKey();
    initClosePrevention();
  }

  var security = {
    init: initSecurity,
    key: function () { return read('panicKey', '['); },
    setKey: function (k) { if (k) { write('panicKey', k.slice(0, 1)); initPanicKey(); } },
    url: panicUrl,
    setUrl: function (u) {
      u = (u || '').trim();
      if (u) write('panicRedirectUrl', /^https?:\/\//i.test(u) ? u : 'https://' + u);
      else drop('panicRedirectUrl');
    },
    enabled: function () { return read('panicEnabled', 'true') !== 'false'; },
    setEnabled: function (on) { write('panicEnabled', on ? 'true' : 'false'); initPanicKey(); },
    confirmClose: function () { return read('verificationEnabled', 'false') === 'true'; },
    setConfirmClose: function (on) { write('verificationEnabled', on ? 'true' : 'false'); initClosePrevention(); }
  };

  // ── First-visit prompt ──────────────────────────────────────────────────

  /* Asked once, on the homepage only. Game pages load inside the player, and a
     modal there would land on top of whatever someone is playing. */
  function askOnce() {
    if (read(DECISION_KEY, null) !== null) return;
    if (window.top !== window.self) return;
    if (!/^\/(index\.html)?$/.test(location.pathname)) return;

    var el = document.createElement('div');
    el.id = 'gvCloakAsk';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Tab cloaking');
    el.innerHTML =
      '<div class="gv-ask-box">' +
        '<div class="gv-ask-kicker">one time question</div>' +
        '<h3>Disguise this tab?</h3>' +
        '<p>GameVault can show up in your tab bar as a Google Doc instead. ' +
        'You can change it or turn it off any time in Settings.</p>' +
        '<div class="gv-ask-actions">' +
          '<button type="button" class="gv-ask-yes">Disguise it</button>' +
          '<button type="button" class="gv-ask-no">Leave it</button>' +
        '</div>' +
      '</div>';

    var css = document.createElement('style');
    css.textContent =
      '#gvCloakAsk{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(8,8,10,0.78);backdrop-filter:blur(6px);font-family:"Space Grotesk",system-ui,sans-serif}' +
      '#gvCloakAsk .gv-ask-box{width:min(92vw,400px);background:#121216;border:1px solid rgba(255,255,255,0.09);' +
      'border-radius:16px;padding:1.5rem;color:#f4f4f6;text-align:left}' +
      '#gvCloakAsk .gv-ask-kicker{font-family:"JetBrains Mono",monospace;font-size:0.64rem;letter-spacing:0.18em;' +
      'text-transform:uppercase;color:#54545e;margin-bottom:0.5rem}' +
      '#gvCloakAsk h3{margin:0 0 0.5rem;font-size:1.25rem;letter-spacing:-0.01em}' +
      '#gvCloakAsk p{margin:0 0 1.25rem;color:#8a8a96;font-size:0.88rem;line-height:1.55}' +
      '#gvCloakAsk .gv-ask-actions{display:flex;gap:0.6rem;flex-wrap:wrap}' +
      '#gvCloakAsk button{flex:1 1 auto;padding:0.65rem 1rem;border-radius:100px;font:inherit;font-size:0.85rem;' +
      'font-weight:600;cursor:pointer;border:1px solid rgba(255,255,255,0.16);background:transparent;color:#f4f4f6}' +
      '#gvCloakAsk .gv-ask-yes{background:#ff3b3b;border-color:#ff3b3b;color:#fff}';

    document.head.appendChild(css);
    document.body.appendChild(el);

    el.querySelector('.gv-ask-yes').addEventListener('click', function () {
      setPreset('docs');
      el.remove();
    });
    el.querySelector('.gv-ask-no').addEventListener('click', function () {
      write(DECISION_KEY, 'no');
      el.remove();
    });
  }

  // ── Google Analytics (kept from the previous build) ──────────────────────

  function initGoogleAnalytics() {
    if (window.__gvGaLoaded) return;
    window.__gvGaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, { page_path: window.location.pathname });
  }

  // ── Boot ────────────────────────────────────────────────────────────────

  window.GV = window.GV || {};
  window.GV.cloak = {
    PRESETS: PRESETS,
    current: current,
    apply: apply,
    setPreset: setPreset,
    setCustom: setCustom,
    setEmail: setEmail,
    reset: reset,
    emailTitle: emailTitle,
    presetById: presetById,
    savedEmail: function () {
      return { user: read('emailUsername', ''), domain: read('emailDomain', 'gmail.com') };
    }
  };
  window.GV.security = security;

  migrateLegacy();
  // Title and favicon before first paint, so the real name never flashes.
  apply();

  function ready() {
    // Again once the document is built: the first pass runs mid-head, before
    // the rest of the page — and anything it adds — exists.
    apply();
    initGoogleAnalytics();
    initSecurity();
    askOnce();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready, { once: true });
  } else {
    ready();
  }
})();

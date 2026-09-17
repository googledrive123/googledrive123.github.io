/**
 * Install GameVault as an app.
 *
 * An installed app opens in its own window with no address bar at all, which
 * is the only cloak Chrome cannot undo — see js/urlcloak.js for why the
 * about:blank popup no longer hides the URL there. The shelf name and icon
 * come from /manifest/<preset>.webmanifest, so the app that shows up in the
 * launcher matches whatever tab disguise is selected in settings.
 *
 * Custom (hand-written) disguises have no manifest of their own and fall back
 * to the GameVault one; settings says so rather than installing a lie.
 *
 * Public surface: window.GV.pwa.
 */
(function () {
  'use strict';

  var FALLBACK = 'gamevault';
  /* Kept in step with PRESETS in js/mimicry.js. An id missing here just means
     the app installs under the GameVault name. */
  var HAVE_MANIFEST = [
    'docs', 'drive', 'sheets', 'slides', 'gmail', 'classroom', 'google',
    'khan', 'canvas', 'schoology', 'desmos', 'campus', 'formative', 'clever', 'd203'
  ];

  var deferred = null;      // the saved beforeinstallprompt event
  var installed = false;
  var listeners = [];

  function manifestIdFor(presetId) {
    return HAVE_MANIFEST.indexOf(presetId) === -1 ? FALLBACK : presetId;
  }

  function currentPresetId() {
    try {
      var c = window.GV && window.GV.cloak && window.GV.cloak.current();
      return (c && c.presetId) || null;
    } catch (e) { return null; }
  }

  function linkTag(rel) {
    var el = document.querySelector("link[rel='" + rel + "']");
    if (!el) {
      el = document.createElement('link');
      el.rel = rel;
      document.head.appendChild(el);
    }
    return el;
  }

  /* Point <link rel="manifest"> at the disguise in use. Chrome re-reads the
     manifest when the href changes, so switching preset before installing is
     enough; an app that is already installed keeps the name it was installed
     with until the browser refreshes it. */
  function applyManifest() {
    var id = manifestIdFor(currentPresetId());
    linkTag('manifest').href = '/manifest/' + id + '.webmanifest';
    linkTag('apple-touch-icon').href = '/icons/' + id + '-192.png';
    return id;
  }

  function isStandalone() {
    if (window.navigator.standalone) return true;
    try {
      return window.matchMedia('(display-mode: standalone)').matches
        || window.matchMedia('(display-mode: window-controls-overlay)').matches;
    } catch (e) { return false; }
  }

  /* 'installed'  already running as, or known to be, an app
     'ready'      the browser handed us a prompt we can fire
     'manual'     installable, but this browser has no scripted prompt
                  (Safari, Firefox, and Chrome before the event lands) */
  function state() {
    if (installed || isStandalone()) return 'installed';
    return deferred ? 'ready' : 'manual';
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state()); } catch (e) {}
    }
  }

  function install() {
    if (!deferred) return Promise.resolve('unavailable');
    var evt = deferred;
    deferred = null;
    emit();
    evt.prompt();
    return evt.userChoice.then(function (choice) {
      return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
    }, function () { return 'dismissed'; });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    emit();
  });

  window.addEventListener('appinstalled', function () {
    installed = true;
    deferred = null;
    emit();
  });

  applyManifest();

  /* The worker is only here to satisfy Chrome's install prompt, so registering
     it late — after the page is up — costs nothing. */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  window.GV = window.GV || {};
  window.GV.pwa = {
    state: state,
    install: install,
    isStandalone: isStandalone,
    applyManifest: applyManifest,
    manifestIdFor: manifestIdFor,
    onChange: function (fn) { listeners.push(fn); }
  };
})();

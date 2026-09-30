/* GameVault home layout preferences, shared by index.html and /settings/.
   Everything is per browser, in localStorage. Public surface: window.GV.layout. */
(function () {
  'use strict';

  function read(k, fallback) {
    try { var v = localStorage.getItem(k); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }

  var layout = {
    // Open straight on the game grid instead of the welcome screen.
    skipWelcome: function () { return read('gv.skipwelcome', '0') === '1'; },
    setSkipWelcome: function (on) { write('gv.skipwelcome', on ? '1' : '0'); }
  };

  window.GV = window.GV || {};
  window.GV.layout = layout;
})();

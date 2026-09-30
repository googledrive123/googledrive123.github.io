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
    setSkipWelcome: function (on) { write('gv.skipwelcome', on ? '1' : '0'); },

    // Smallest width of a game tile, in px. The grid fits as many as it can.
    TILE_MIN: 130,
    TILE_MAX: 300,
    TILE_DEFAULT: 190,
    tileSize: function () {
      var n = parseInt(read('gv.tilesize', ''), 10);
      if (!(n >= layout.TILE_MIN && n <= layout.TILE_MAX)) n = layout.TILE_DEFAULT;
      return n;
    },
    setTileSize: function (n) {
      write('gv.tilesize', String(Math.round(n)));
      layout.applyTileSize();
    },
    applyTileSize: function () {
      document.documentElement.style.setProperty('--tile-min', layout.tileSize() + 'px');
    },

    // Home rows someone chose to hide: 'popular', 'starred', 'recent'.
    ROWS: ['popular', 'starred', 'recent'],
    hidden: function (row) { return read('gv.hide.' + row, '0') === '1'; },
    setHidden: function (row, on) { write('gv.hide.' + row, on ? '1' : '0'); },

    // 'dark' or 'light'. js/mimicry.js applies it before the first paint.
    theme: function () { return read('gv.theme', 'dark') === 'light' ? 'light' : 'dark'; },
    setTheme: function (t) {
      write('gv.theme', t === 'light' ? 'light' : 'dark');
      if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
    }
  };

  window.GV = window.GV || {};
  window.GV.layout = layout;
  layout.applyTileSize();
})();

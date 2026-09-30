/* GameVault seasonal fun: April Fools pranks, Halloween decorations and a
   secret corner that opens /secret/.
   Runs on the home page and on every subpage, so it looks for what is there
   (the game grid, the game overlay, a header) and skips what is not. Outside
   April 1 and late October it adds one invisible link and nothing else: no
   listeners, no timers, no styles.
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
})();

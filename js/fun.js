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
})();

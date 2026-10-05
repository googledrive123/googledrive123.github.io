/* GameVault Track of the Week badges: the one each week's winner and top 3
   take home, and the row of them drawn beside a player's name.
   Public surface: window.GV.badges. */
(function () {
  'use strict';

  // The first weekly challenge. Each week after it is one design further on.
  var FIRST_WEEK = Date.UTC(2026, 8, 28);
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // The week a challenge starting on this day ('2026-10-05') is, counted from
  // the first weekly one.
  function weekOf(starts) {
    var p = String(starts || '').split('-');
    var at = Date.UTC(+p[0], +p[1] - 1, +p[2]);
    return isNaN(at) ? 0 : Math.floor((at - FIRST_WEEK) / WEEK_MS);
  }

  function mod(n, m) { return ((n % m) + m) % m; }

  window.GV = window.GV || {};
  window.GV.badges = {};
})();

/* GameVault Track of the Week badges: the one each week's winner and top 3
   take home, and the row of them drawn beside a player's name.
   Public surface: window.GV.badges. */
(function () {
  'use strict';

  // The first weekly challenge. Each week after it is one design further on.
  var FIRST_WEEK = Date.UTC(2026, 8, 28);
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // Seven colours against twelve designs: the same pair comes round again
  // only after 84 weeks.
  var COLORS = ['#e5484d', '#0090ff', '#30a46c', '#8e4ec6', '#f76b15', '#12a594', '#d6409f'];

  // ── Shapes ────────────────────────────────────────────────────────────
  // Drawn on a 32 by 32 grid. A regular polygon or star, as a path.
  function polygon(points, outer, inner, cy, turn) {
    var d = '';
    var count = inner ? points * 2 : points;
    for (var i = 0; i < count; i++) {
      var r = inner && i % 2 ? inner : outer;
      var a = (turn || 0) + (i / count) * Math.PI * 2 - Math.PI / 2;
      d += (i ? 'L' : 'M') + (16 + r * Math.cos(a)).toFixed(2) + ' ' + ((cy || 16) + r * Math.sin(a)).toFixed(2);
    }
    return d + 'Z';
  }

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

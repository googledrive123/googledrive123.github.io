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

  var SHAPES = {
    shield: 'M16 2.5 27.5 6.5V15c0 7-4.8 12.2-11.5 14.5C9.3 27.2 4.5 22 4.5 15V6.5Z',
    hexagon: polygon(6, 14),
    circle: 'M16 2.5a13.5 13.5 0 1 1 0 27 13.5 13.5 0 0 1 0-27Z',
    diamond: 'M16 1.8 30.2 16 16 30.2 1.8 16Z',
    octagon: polygon(8, 14.2, 0, 16, Math.PI / 8),
    rosette: polygon(12, 14.6, 12.4),
    square: 'M9 3.5h14a5.5 5.5 0 0 1 5.5 5.5v14a5.5 5.5 0 0 1-5.5 5.5H9A5.5 5.5 0 0 1 3.5 23V9A5.5 5.5 0 0 1 9 3.5Z',
    pentagon: polygon(5, 14.6, 0, 17),
    banner: 'M4.5 3.5h23v17L16 29 4.5 20.5Z',
    star: polygon(8, 14.8, 10.8),
    flathex: polygon(6, 14, 0, 16, Math.PI / 6),
    crest: 'M5 4.5Q16 9 27 4.5V16c0 7-4.8 11.4-11 13.5C9.8 27.4 5 23 5 16Z'
  };

  // ── Emblems ───────────────────────────────────────────────────────────
  // White on the badge's colour. Each is a function of that colour, for the
  // few that cut lines back into themselves.
  var W = 'fill="#fff"';
  var LINE = 'fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"';

  var EMBLEMS = {
    flag: function () {
      return '<path ' + W + ' d="M10 8h1.8v16H10z"/>'
        + '<path ' + LINE + ' stroke-width="1.2" d="M11.8 8.6h10v7.2h-10"/>'
        + '<path ' + W + ' d="M11.8 8.6h2.5v3.6h-2.5zM16.8 8.6h2.5v3.6h-2.5zM14.3 12.2h2.5v3.6h-2.5zM19.3 12.2h2.5v3.6h-2.5z"/>';
    },
    bolt: function () {
      return '<path ' + W + ' d="M18.5 6 10 18h5.5L13.5 26 22 14h-5.5Z"/>';
    },
    star: function () {
      return '<path ' + W + ' d="' + polygon(5, 8, 3.5, 16.6) + '"/>';
    },
    flame: function () {
      return '<path ' + W + ' d="M16 6c1 4 6 6 6 11.5a6 6 0 0 1-12 0c0-3 1.6-4.8 3-6 .2 2 1 3 2 3.5C14.5 12 15 9 16 6Z"/>';
    },
    crown: function () {
      return '<path ' + W + ' d="M8.5 20.5 7.5 11.5l4.8 4L16 9l3.7 6.5 4.8-4-1 9ZM9 22h14v2.4H9Z"/>';
    },
    wheel: function () {
      return '<circle ' + LINE + ' stroke-width="2.4" cx="16" cy="16" r="7.4"/>'
        + '<circle ' + W + ' cx="16" cy="16" r="2.2"/>'
        + '<path ' + LINE + ' stroke-width="1.8" d="M16 13.8V9M14.1 17.1 9.9 19.5M17.9 17.1l4.2 2.4"/>';
    },
    chevrons: function () {
      return '<path ' + LINE + ' stroke-width="3" d="M9 9.5l6 6.5-6 6.5M16.5 9.5l6 6.5-6 6.5"/>';
    },
    trophy: function () {
      return '<path ' + W + ' d="M11 8h10v4.5a5 5 0 0 1-10 0ZM15 17.2h2v3.6h-2ZM11.5 21h9v2.6h-9Z"/>'
        + '<path ' + LINE + ' stroke-width="1.6" d="M11 9.6H8.6v1.2a3 3 0 0 0 3 3M21 9.6h2.4v1.2a3 3 0 0 1-3 3"/>';
    },
    comet: function () {
      return '<circle ' + W + ' cx="19.5" cy="12.5" r="4"/>'
        + '<path ' + LINE + ' stroke-width="2" d="M16.2 15.8 8.5 23.5M14.6 12.6 10 17.2M19.4 17.4 14.8 22"/>';
    },
    peak: function () {
      return '<path ' + W + ' d="M6 23 13 10.5l4.2 6.4 2.4-3.4L26 23Z"/>';
    },
    gem: function (color) {
      return '<path ' + W + ' d="M11 9h10l4 5-9 10.5L7 14Z"/>'
        + '<path fill="none" stroke="' + color + '" stroke-width="1.1" stroke-linejoin="round" d="M7.4 14h17.2M13 9l-1.6 5L16 24l4.6-10L19 9"/>';
    },
    stopwatch: function () {
      return '<circle ' + LINE + ' stroke-width="2.4" cx="16" cy="17.6" r="7"/>'
        + '<path ' + W + ' d="M14.4 6.6h3.2v2.6h-3.2z"/>'
        + '<path ' + LINE + ' stroke-width="2.2" d="M16 17.6v-4.2"/>';
    }
  };

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

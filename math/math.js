/* Math practice for /math/.
   Every question comes from a template filled with random numbers, so there
   is always another one. Progress is one JSON object in localStorage (gv.math)
   and never leaves the browser. */
(function () {
  'use strict';

  var KEY = 'gv.math';
  var POINTS = { easy: 10, medium: 20, hard: 30 };
  var LEVELS = [
    { id: 'easy', name: 'Easy' },
    { id: 'medium', name: 'Medium' },
    { id: 'hard', name: 'Hard' }
  ];
  var SUBJECTS = [
    { id: 'arithmetic', name: 'Arithmetic', glyph: '+−' },
    { id: 'fractions', name: 'Fractions & Percents', glyph: '%' },
    { id: 'algebra', name: 'Algebra', glyph: 'x' },
    { id: 'functions', name: 'Functions', glyph: 'f(x)' },
    { id: 'geometry', name: 'Geometry', glyph: '△' },
    { id: 'calculus', name: 'Calculus basics', glyph: '∫' }
  ];

  // ── Random numbers ──────────────────────────────────────────────────────

  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function nz(a, b) { var n; do { n = ri(a, b); } while (n === 0); return n; }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function coin(odds) { return Math.random() < (odds == null ? 0.5 : odds); }
  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }
  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = b; b = a % b; a = t; }
    return a;
  }
  function lcm(a, b) { return a / gcd(a, b) * b; }
})();

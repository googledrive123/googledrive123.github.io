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

  // ── Writing numbers and maths ───────────────────────────────────────────

  /* A tidy number with a real minus sign. Rounding to six places hides float
     noise like 0.1 + 0.2. */
  function s(x) {
    var t = String(Math.round(x * 1e6) / 1e6);
    return t.charAt(0) === '-' ? '−' + t.slice(1) : t;
  }
  function p(x) { return x < 0 ? '(' + s(x) + ')' : s(x); }
  function signed(x) { return x < 0 ? '− ' + s(-x) : '+ ' + s(x); }
  function money(x) { return '$' + s(x); }

  function fr(n, d) { return '<span class="frac"><span>' + n + '</span><span>' + d + '</span></span>'; }
  function frac(n, d) {
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d) || 1; n /= g; d /= g;
    if (d === 1) return s(n);
    return (n < 0 ? '−' : '') + fr(Math.abs(n), d);
  }
  // The same fraction as someone would type it, for answers and explanations.
  function ft(n, d) {
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d) || 1; n /= g; d /= g;
    return d === 1 ? s(n) : s(n) + '/' + d;
  }
  function mixed(n, d) {
    var g = gcd(n, d) || 1; n /= g; d /= g;
    var w = Math.floor(n / d), r = n % d;
    if (!r) return String(w);
    return w ? w + ' ' + r + '/' + d : r + '/' + d;
  }
  // A multiple of π; brackets keep 33/4 of π from reading as 33 over 4π.
  function piText(n, d) {
    var t = ft(n, d);
    return t === '1' ? 'π' : t.indexOf('/') < 0 ? t + 'π' : '(' + t + ')π';
  }
  function mix(w, n, d) { return w + '<span class="gap"></span>' + fr(n, d); }
  function sup(b, e) { return b + '<sup>' + e + '</sup>'; }
  function root(x) { return '√<span class="rad">' + x + '</span>'; }
  function rt(k, n) { return (k === 1 ? '' : s(k)) + root(n); }
  function lim(to, body) { return '<span class="lim">lim<span>x→' + to + '</span></span> ' + body; }
  // With no limits it is the plain ∫ ... dx of an antiderivative.
  function integral(a, b, body) {
    var ends = a == null ? '' : '<span class="ends"><span>' + b + '</span><span>' + a + '</span></span>';
    return '<span class="int"><span class="sign">∫</span>' + ends + '</span>' + body + ' dx';
  }
  function ddx(body) { return fr('d', 'dx') + '(' + body + ')'; }
  function lines() {
    return Array.prototype.map.call(arguments, function (l) { return '<div>' + l + '</div>'; }).join('');
  }
  function xy(x, y) { return '(' + s(x) + ', ' + s(y) + ')'; }

  // One term like 3x², −x or 7.
  function term(c, n, v) {
    v = v || 'x';
    if (n === 0) return s(c);
    var body = n === 1 ? v : v + '<sup>' + n + '</sup>';
    if (c === 1) return body;
    if (c === -1) return '−' + body;
    return s(c) + body;
  }
  // Coefficients from the highest power down: [3, 0, -2] is 3x² − 2.
  function poly(cs, v) {
    var deg = cs.length - 1, out = '';
    cs.forEach(function (c, i) {
      if (!c) return;
      var t = term(Math.abs(c), deg - i, v);
      out += out ? (c < 0 ? ' − ' : ' + ') + t : (c < 0 ? '−' : '') + t;
    });
    return out || '0';
  }

  // ── Question shapes ─────────────────────────────────────────────────────

  /* A typed answer. ans is the exact value, show is how the answer is written
     back, and opt can carry a unit ('%', 'π', '$', '°', 'cm²'…) or noFrac for
     "write it as a decimal" questions. */
  function num(ask, expr, ans, show, why, opt) {
    var q = { type: 'num', ask: ask, expr: expr, ans: ans, show: show, why: why };
    for (var k in opt) q[k] = opt[k];
    return q;
  }
  // Multiple choice. Duplicates are dropped, so wrongs can over-supply.
  function choice(ask, expr, right, wrongs, why) {
    var list = [right];
    wrongs.forEach(function (w) { if (list.length < 4 && list.indexOf(w) < 0) list.push(w); });
    shuffle(list);
    return { type: 'mc', ask: ask, expr: expr, choices: list, answer: list.indexOf(right), show: right, why: why };
  }
  // Multiple choice whose options read in a fixed order, like None, One, Two.
  function fixed(ask, expr, options, answer, why) {
    return { type: 'mc', ask: ask, expr: expr, choices: options, answer: answer, show: options[answer], why: why };
  }
})();

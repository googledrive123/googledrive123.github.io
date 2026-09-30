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

  // ── Arithmetic ──────────────────────────────────────────────────────────

  var arithmetic = {
    easy: [
      function () {
        var a = ri(12, 89), b = ri(12, 89), ta = a - a % 10, tb = b - b % 10;
        return num('Add.', a + ' + ' + b, a + b, s(a + b),
          'Tens: ' + ta + ' + ' + tb + ' = ' + (ta + tb) + '. Ones: ' + a % 10 + ' + ' + b % 10 + ' = ' +
          (a % 10 + b % 10) + '. Together: ' + (a + b) + '.');
      },
      function () {
        var a = ri(31, 99), b = ri(11, a - 5), d = a - b;
        return num('Subtract.', a + ' − ' + b, d, s(d), 'Check by adding back: ' + d + ' + ' + b + ' = ' + a + '.');
      },
      function () {
        var a = ri(2, 12), b = ri(2, 12);
        return num('Multiply.', a + ' × ' + b, a * b, s(a * b), a + ' groups of ' + b + ' make ' + a * b + '.');
      },
      function () {
        var b = ri(2, 12), q = ri(2, 12), a = b * q;
        return num('Divide.', a + ' ÷ ' + b, q, s(q), q + ' × ' + b + ' = ' + a + ', so ' + a + ' ÷ ' + b + ' = ' + q + '.');
      },
      function () {
        var a = ri(6, 45), x = ri(5, 50), t = a + x;
        return num('What number goes in the box?', '<span class="box"></span> + ' + a + ' = ' + t, x, s(x),
          'Take ' + a + ' away from ' + t + ': ' + t + ' − ' + a + ' = ' + x + '.');
      },
      function () {
        var n; do { n = ri(102, 988); } while (n % 10 === 0);
        var o = n % 10, r = o >= 5 ? n - o + 10 : n - o;
        return num('Round to the nearest ten.', String(n), r, s(r), 'The ones digit is ' + o +
          (o >= 5 ? ', which is 5 or more, so round up to ' : ', which is under 5, so round down to ') + r + '.');
      },
      function () {
        var digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4), at = ri(0, 3);
        var place = Math.pow(10, 3 - at), worth = digits[at] * place;
        var shown = digits.map(function (d, i) { return i === at ? '<span class="hl">' + d + '</span>' : d; });
        return num('What is the highlighted digit worth?', shown[0] + ',' + shown.slice(1).join(''), worth, s(worth),
          'It sits in the ' + ['thousands', 'hundreds', 'tens', 'ones'][at] + ' place, so it is worth ' +
          (place === 1 ? digits[at] : digits[at] + ' × ' + place + ' = ' + worth) + '.');
      }
    ],
    medium: [
      function () {
        var a = ri(12, 49), b; do { b = ri(13, 39); } while (b % 10 === 0);
        var bt = b - b % 10, bo = b % 10;
        return num('Multiply.', a + ' × ' + b, a * b, s(a * b), 'Split ' + b + ' into ' + bt + ' + ' + bo + ': ' +
          a + ' × ' + bt + ' = ' + a * bt + ' and ' + a + ' × ' + bo + ' = ' + a * bo + ', total ' + a * b + '.');
      },
      function () {
        var a = ri(2, 20), b = ri(2, 9), c = ri(2, 9), form = ri(0, 2);
        if (form === 0) {
          return num('Work it out.', a + ' + ' + b + ' × ' + c, a + b * c, s(a + b * c),
            'Multiply before adding: ' + b + ' × ' + c + ' = ' + b * c + ', then ' + a + ' + ' + b * c + ' = ' + (a + b * c) + '.');
        }
        if (form === 1) {
          return num('Work it out.', '(' + a + ' + ' + b + ') × ' + c, (a + b) * c, s((a + b) * c),
            'Brackets first: ' + a + ' + ' + b + ' = ' + (a + b) + ', then × ' + c + ' = ' + (a + b) * c + '.');
        }
        var k = ri(2, 9), big = b * k, top = ri(k + 1, k + 40);
        return num('Work it out.', top + ' − ' + big + ' ÷ ' + b, top - k, s(top - k),
          'Divide before subtracting: ' + big + ' ÷ ' + b + ' = ' + k + ', then ' + top + ' − ' + k + ' = ' + (top - k) + '.');
      },
      function () {
        var a = ri(2, 20), b = ri(2, 20), form = ri(0, 3), ans, expr, why;
        if (form === 0) {
          expr = '−' + a + ' + ' + b; ans = b - a;
          why = 'Start at −' + a + ' and move ' + b + ' up the number line: ' + s(ans) + '.';
        } else if (form === 1) {
          expr = a + ' − (−' + b + ')'; ans = a + b;
          why = 'Taking away a negative is the same as adding: ' + a + ' + ' + b + ' = ' + ans + '.';
        } else if (form === 2) {
          a = ri(2, 12); b = ri(2, 12); expr = '−' + a + ' × ' + b; ans = -a * b;
          why = 'Negative times positive is negative: ' + a + ' × ' + b + ' = ' + a * b + ', so ' + s(ans) + '.';
        } else {
          expr = '−' + a + ' − ' + b; ans = -a - b;
          why = 'Both move down: ' + a + ' + ' + b + ' = ' + (a + b) + ' below zero, so ' + s(ans) + '.';
        }
        return num('Work it out.', expr, ans, s(ans), why);
      },
      function () {
        var d = ri(3, 9), q = ri(21, 99), a = d * q;
        return num('Divide.', a + ' ÷ ' + d, q, s(q), q + ' × ' + d + ' = ' + a + ', so ' + a + ' ÷ ' + d + ' = ' + q + '.');
      },
      function () {
        var form = ri(0, 2), b, e;
        if (form === 0) { b = ri(11, 15); e = 2; }
        else if (form === 1) { b = 2; e = ri(4, 10); }
        else { b = pick([3, 4, 5]); e = b === 3 ? ri(3, 5) : 3; }
        var v = Math.pow(b, e), chain = [];
        for (var i = 0; i < e; i++) chain.push(b);
        return num('Work it out.', sup(b, e), v, s(v), sup(b, e) + ' means ' + chain.join(' × ') + ' = ' + v + '.');
      },
      function () {
        var k = ri(11, 20), n = k * k;
        return num('Find the square root.', root(n), k, s(k), k + ' × ' + k + ' = ' + n + ', so ' + root(n) + ' = ' + k + '.');
      },
      function () {
        var a = ri(11, 99), b = ri(101, 999), minus = a * 10 > b && coin(0.4);
        var r = minus ? a * 10 - b : a * 10 + b, op = minus ? ' − ' : ' + ';
        return num(minus ? 'Subtract.' : 'Add.', (a / 10).toFixed(1) + op + (b / 100).toFixed(2), r / 100, s(r / 100),
          'Line up the decimal points: ' + (a / 10).toFixed(2) + op + (b / 100).toFixed(2) + ' = ' + (r / 100).toFixed(2) + '.');
      }
    ],
    hard: [
      function () {
        if (coin()) {
          var a = ri(3, 9), b = ri(2, 6), c = ri(5, 12), d = ri(1, c - 1), e = c - d, r = a * a - b * e;
          return num('Work it out.', sup(a, 2) + ' − ' + b + ' × (' + c + ' − ' + d + ')', r, s(r),
            'Brackets give ' + e + ', the power gives ' + a * a + ', then ' + a * a + ' − ' + b + ' × ' + e + ' = ' +
            a * a + ' − ' + b * e + ' = ' + s(r) + '.');
        }
        var x = ri(2, 6), y = ri(2, 9), z = ri(2, 5), w = ri(2, 30), r2 = x * y - z * z + w;
        return num('Work it out.', x + ' × ' + y + ' − ' + sup(z, 2) + ' + ' + w, r2, s(r2),
          'Power first (' + z * z + '), then multiply (' + x * y + '), then left to right: ' +
          x * y + ' − ' + z * z + ' + ' + w + ' = ' + s(r2) + '.');
      },
      function () {
        var a = ri(2, 9), b = ri(2, 9), c = ri(2, 9), d = ri(2, 9), r = a * b + c * d;
        return num('Work it out.', '(−' + a + ')(−' + b + ') − ' + c + ' × (−' + d + ')', r, s(r),
          '(−' + a + ')(−' + b + ') = ' + a * b + ' and ' + c + ' × (−' + d + ') = −' + c * d + ', so ' +
          a * b + ' − (−' + c * d + ') = ' + r + '.');
      },
      function () {
        var x = ri(11, 49), y = ri(2, 9), prod = x * y;
        return num('Multiply.', (x / 10).toFixed(1) + ' × ' + (y / 10).toFixed(1), prod / 100, s(prod / 100),
          x + ' × ' + y + ' = ' + prod + ', and there are two decimal places in total, so ' + s(prod / 100) + '.');
      },
      function () {
        var d = pick([[2, 10], [4, 10], [5, 10], [25, 100], [5, 100], [15, 100]]);
        var q = ri(3, 40), top = q * d[0];
        return num('Divide.', s(top / d[1]) + ' ÷ ' + s(d[0] / d[1]), q, s(q),
          'Multiply both by ' + d[1] + ' to clear the decimals: ' + top + ' ÷ ' + d[0] + ' = ' + q + '.');
      },
      function () {
        var g = ri(3, 15), m, n;
        do { m = ri(2, 9); n = ri(2, 9); } while (m === n || gcd(m, n) !== 1);
        return num('Find the greatest common factor.', 'GCF(' + g * m + ', ' + g * n + ')', g, s(g),
          g * m + ' = ' + g + ' × ' + m + ' and ' + g * n + ' = ' + g + ' × ' + n + ', and ' + m + ' and ' + n +
          ' share no factor, so the GCF is ' + g + '.');
      },
      function () {
        var a, b, l;
        do { a = ri(4, 18); b = ri(4, 18); l = lcm(a, b); } while (a === b || l > 200 || l === Math.max(a, b));
        return num('Find the least common multiple.', 'LCM(' + a + ', ' + b + ')', l, s(l),
          'LCM = ' + a + ' × ' + b + ' ÷ GCF = ' + a * b + ' ÷ ' + gcd(a, b) + ' = ' + l + '.');
      },
      function () {
        var b = pick([2, 3, 5, 10]), x = ri(2, 9), y = ri(2, 9), z = ri(1, x + y - 1), e = x + y - z;
        return num('Find the missing power.', sup(b, x) + ' × ' + sup(b, y) + ' ÷ ' + sup(b, z) + ' = ' + sup(b, '?'), e, s(e),
          'Multiplying adds powers and dividing subtracts them: ' + x + ' + ' + y + ' − ' + z + ' = ' + e + '.');
      },
      function () {
        var k = ri(2, 10) * (coin(0.25) ? -1 : 1), n = k * k * k;
        return num('Find the cube root.', '∛<span class="rad">' + s(n) + '</span>', k, s(k),
          s(k) + ' × ' + p(k) + ' × ' + p(k) + ' = ' + s(n) + '.');
      },
      function () {
        var m = ri(11, 99), e = ri(3, 7), mant = s(m / 10);
        var value = (m * Math.pow(10, e - 1)).toLocaleString('en-US');
        return choice('Which is ' + value + ' in scientific notation?', '',
          mant + ' × ' + sup(10, e),
          [m + ' × ' + sup(10, e - 1), mant + ' × ' + sup(10, e - 1), mant + ' × ' + sup(10, e + 1)],
          'Move the point ' + e + ' places so one digit is left in front: ' + mant + ' × ' + sup(10, e) + '.');
      }
    ]
  };

  // ── Fractions & Percents ────────────────────────────────────────────────

  /* Wrong fractions for a multiple choice: proper, and not equal in value to
     the right one or to each other once reduced. */
  function fracWrongs(n, d, pairs) {
    return pairs.filter(function (f) {
      return f[0] > 0 && f[0] < f[1] && f[0] * d !== n * f[1];
    }).map(function (f) { return frac(f[0], f[1]); });
  }

  var fractions = {
    easy: [
      function () {
        var d = pick([2, 3, 4, 5, 10]), n; do { n = ri(1, d - 1); } while (gcd(n, d) !== 1);
        var w = d * ri(2, 12), part = w / d, ans = part * n;
        return num('Work it out.', fr(n, d) + ' of ' + w, ans, s(ans),
          w + ' ÷ ' + d + ' = ' + part + (n > 1 ? ', and ' + part + ' × ' + n + ' = ' + ans : '') + '.');
      },
      function () {
        var d = ri(5, 12), a = ri(1, d - 2), b = ri(1, d - 1 - a), minus = coin(0.4);
        var x = minus ? a + b : a, top = minus ? a : a + b, op = minus ? ' − ' : ' + ';
        return num(minus ? 'Subtract.' : 'Add.', fr(x, d) + op + fr(b, d), top / d, ft(top, d),
          'The bottoms match, so ' + (minus ? 'subtract' : 'add') + ' the tops: ' + x + op + b + ' = ' + top +
          ', giving ' + top + '/' + d + (gcd(top, d) > 1 ? ' = ' + ft(top, d) : '') + '.');
      },
      function () {
        var pc = pick([10, 20, 25, 50, 75]);
        var split = { 10: 10, 20: 5, 25: 4, 50: 2, 75: 4 }[pc], w = split * ri(2, 25), ans = w * pc / 100;
        var why = pc === 75
          ? '25% is a quarter: ' + w + ' ÷ 4 = ' + w / 4 + ', and 75% is three of those: ' + ans + '.'
          : pc + '% is ' + { 10: 'a tenth', 20: 'a fifth', 25: 'a quarter', 50: 'half' }[pc] + ', so ' +
            w + ' ÷ ' + split + ' = ' + ans + '.';
        return num('Work it out.', pc + '% of ' + w, ans, s(ans), why);
      },
      function () {
        var f = pick([[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [3, 10], [7, 10], [9, 10],
          [1, 20], [3, 20], [7, 20], [4, 25], [6, 25], [1, 8], [3, 8], [5, 8], [7, 8]]);
        var base = 100 % f[1] === 0 ? 100 : 1000, v = f[0] / f[1];
        return num('Write it as a decimal.', fr(f[0], f[1]), v, s(v), 'Make the bottom ' + base + ': ' + f[0] + '/' + f[1] +
          ' = ' + f[0] * base / f[1] + '/' + base + ' = ' + s(v) + '.', { noFrac: true });
      },
      function () {
        var h = coin(0.3) ? ri(1, 9) * 10 : ri(1, 99), v = h / 100;
        return num('Write it as a percent.', s(v), h, h + '%',
          'Multiply by 100, which moves the point two places right: ' + s(v) + ' × 100 = ' + h + '%.', { unit: '%' });
      },
      function () {
        var d = ri(3, 12), n; do { n = ri(1, d - 1); } while (gcd(n, d) !== 1);
        var k = ri(2, 6);
        // Halving 12/16 to 6/8 is a real mistake: equal, but not simplest.
        var halfway = k % 2 === 0 && k > 2 ? [fr(n * k / 2, d * k / 2)] : [];
        return choice('Which is the simplest form?', fr(n * k, d * k), frac(n, d),
          halfway.concat(fracWrongs(n, d, [[n, d + 1], [n + 1, d], [n, d - 1], [n - 1, d], [n + 1, d + 1]])),
          'Divide the top and bottom by ' + k + ': ' + n * k + '/' + d * k + ' = ' + n + '/' + d + '.');
      }
    ],
    medium: [
      function () {
        var b, d; do { b = ri(2, 9); d = ri(2, 9); } while (b === d);
        var a = ri(1, b - 1), c = ri(1, d - 1), l = lcm(b, d), x = a * l / b, y = c * l / d, minus = coin(0.4) && x !== y;
        if (minus && x < y) { var t = a; a = c; c = t; t = b; b = d; d = t; t = x; x = y; y = t; }
        var top = minus ? x - y : x + y, op = minus ? ' − ' : ' + ';
        return num(minus ? 'Subtract.' : 'Add.', fr(a, b) + op + fr(c, d), top / l, ft(top, l),
          'Use a common bottom of ' + l + ': ' + x + '/' + l + op + y + '/' + l + ' = ' + top + '/' + l +
          (gcd(top, l) > 1 ? ' = ' + ft(top, l) : '') + '.');
      },
      function () {
        var a = ri(1, 8), b = ri(a + 1, 9), c = ri(1, 8), d = ri(c + 1, 9), t = a * c, u = b * d;
        return num('Multiply.', fr(a, b) + ' × ' + fr(c, d), t / u, ft(t, u),
          'Multiply the tops and the bottoms: ' + t + '/' + u + (gcd(t, u) > 1 ? ' = ' + ft(t, u) : '') + '.');
      },
      function () {
        var a = ri(1, 8), b = ri(a + 1, 9), c = ri(1, 8), d = ri(c + 1, 9), t = a * d, u = b * c;
        return num('Divide.', fr(a, b) + ' ÷ ' + fr(c, d), t / u, ft(t, u),
          'Flip the second fraction and multiply: ' + a + '/' + b + ' × ' + d + '/' + c + ' = ' + t + '/' + u +
          (gcd(t, u) > 1 ? ' = ' + ft(t, u) : '') + '.');
      },
      function () {
        var pc = ri(1, 19) * 5, w = ri(1, 20) * 20, ans = pc * w / 100;
        return num('Work it out.', pc + '% of ' + w, ans, s(ans),
          '1% of ' + w + ' is ' + s(w / 100) + ', so ' + pc + '% is ' + s(w / 100) + ' × ' + pc + ' = ' + s(ans) + '.');
      },
      function () {
        var w = pick([20, 25, 40, 50, 80, 200, 250, 400, 500]), pc, part;
        do { pc = ri(1, 19) * 5; part = w * pc / 100; } while (part !== Math.round(part));
        return num('What percent of ' + w + ' is ' + part + '?', '', pc, pc + '%',
          part + ' ÷ ' + w + ' = ' + s(part / w) + ', and ' + s(part / w) + ' × 100 = ' + pc + '%.', { unit: '%' });
      },
      function () {
        var price, pc, up = coin(), change;
        do { price = ri(2, 30) * 10; pc = pick([10, 15, 20, 25, 30, 40, 50]); change = price * pc / 100; }
        while (change !== Math.round(change));
        var ans = up ? price + change : price - change;
        return num('A ' + money(price) + ' ' + pick(['jacket', 'game', 'skateboard', 'concert ticket']) + ' goes ' +
          (up ? 'up' : 'down') + ' by ' + pc + '%. What is the new price?', '', ans, money(ans),
          pc + '% of ' + money(price) + ' is ' + money(change) + ', so ' + price + (up ? ' + ' : ' − ') + change + ' = ' + money(ans) + '.',
          { unit: '$' });
      },
      function () {
        var d = ri(2, 9), r; do { r = ri(1, d - 1); } while (gcd(r, d) !== 1);
        var w = ri(1, 5), n = w * d + r;
        if (coin()) {
          return choice('Write it as a mixed number.', fr(n, d), mix(w, r, d),
            [mix(w + 1, r, d), mix(w, d - r, d), mix(w > 1 ? w - 1 : w + 2, r, d), mix(w, r, d + 1)],
            n + ' ÷ ' + d + ' = ' + w + ' remainder ' + r + ', so ' + n + '/' + d + ' = ' + w + ' ' + r + '/' + d + '.');
        }
        return choice('Write it as an improper fraction.', mix(w, r, d), fr(n, d),
          [fr(w * d - r, d), fr(w + r, d), fr(w * r + d, d), fr(n + d, d)],
          w + ' × ' + d + ' + ' + r + ' = ' + n + ', so ' + w + ' ' + r + '/' + d + ' = ' + n + '/' + d + '.');
      },
      function () {
        var f = pick([[1, 8], [3, 8], [5, 8], [7, 8], [2, 5], [3, 5], [4, 5], [7, 20], [9, 20], [3, 4], [1, 4], [3, 25], [6, 25]]);
        var dec = s(f[0] / f[1]), digits = dec.slice(2), scale = Math.pow(10, digits.length);
        return choice('Which fraction equals ' + dec + '?', '', frac(f[0], f[1]),
          fracWrongs(f[0], f[1], [[f[0] + 1, f[1]], [f[0], f[1] + 1], [+digits, scale * 10], [f[0], 10], [f[0] + 1, f[1] + 1]]),
          dec + ' = ' + digits + '/' + scale + ', which simplifies to ' + ft(f[0], f[1]) + '.');
      }
    ],
    hard: [
      function () {
        function one() {
          var b = ri(2, 6), a; do { a = ri(1, b - 1); } while (gcd(a, b) !== 1);
          return { w: ri(1, 4), a: a, b: b };
        }
        var m = one(), k = one(), n1 = m.w * m.b + m.a, n2 = k.w * k.b + k.a, l = lcm(m.b, k.b);
        var x = n1 * l / m.b, y = n2 * l / k.b, minus = coin(0.4) && x > y, top = minus ? x - y : x + y, op = minus ? ' − ' : ' + ';
        var show = mixed(top, l) + (top > l && top % l ? ' (or ' + ft(top, l) + ')' : '');
        return num(minus ? 'Subtract.' : 'Add.', mix(m.w, m.a, m.b) + op + mix(k.w, k.a, k.b), top / l, show,
          'As improper fractions: ' + n1 + '/' + m.b + op + n2 + '/' + k.b + ' = ' + x + '/' + l + op + y + '/' + l +
          ' = ' + top + '/' + l + (mixed(top, l) !== top + '/' + l ? ' = ' + mixed(top, l) : '') + '.');
      },
      function () {
        var a = pick([20, 40, 50, 80, 120, 200, 250, 400]), up = coin(), pc, b;
        do { pc = pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75]); b = a * (100 + (up ? pc : -pc)) / 100; }
        while (b !== Math.round(b));
        var change = Math.abs(b - a);
        return num('A price goes from ' + money(a) + ' to ' + money(b) + '. By what percent did it go ' + (up ? 'up' : 'down') + '?',
          '', pc, pc + '%', 'The change is ' + money(change) + ', and ' + change + ' ÷ ' + a + ' = ' + s(change / a) + ' = ' + pc + '%.',
          { unit: '%' });
      },
      function () {
        var was = ri(2, 20) * 20, pc, now;
        do { pc = pick([10, 20, 25, 30, 40, 50]); now = was * (100 - pc) / 100; } while (now !== Math.round(now));
        return num('After ' + pc + '% off, a pair of headphones costs ' + money(now) + '. What was the price before the sale?', '',
          was, money(was), money(now) + ' is ' + (100 - pc) + '% of the old price, so ' + now + ' ÷ ' + s((100 - pc) / 100) +
          ' = ' + money(was) + '.', { unit: '$' });
      },
      function () {
        var start = ri(2, 9) * 100, pc = pick([10, 20, 30, 50]);
        var mid = start * (100 + pc) / 100, end = mid * (100 - pc) / 100;
        return num('A ' + money(start) + ' price goes up ' + pc + '%, then the new price goes down ' + pc + '%. What is the final price?', '',
          end, money(end), 'Up: ' + start + ' × ' + s(1 + pc / 100) + ' = ' + mid + '. Down: ' + mid + ' × ' + s(1 - pc / 100) +
          ' = ' + s(end) + '. It does not get back to ' + money(start) + '.', { unit: '$' });
      },
      function () {
        var amount = ri(2, 20) * 100, rate = ri(2, 8), years = ri(2, 5), earned = amount * rate * years / 100;
        return num('How much simple interest does ' + money(amount) + ' earn at ' + rate + '% a year for ' + years + ' years?', '',
          earned, money(earned), 'Interest = ' + amount + ' × ' + s(rate / 100) + ' × ' + years + ' = ' + money(earned) + '.',
          { unit: '$' });
      },
      function () {
        var a, b, c, d;
        do { b = ri(2, 6); a = ri(1, b - 1); } while (gcd(a, b) !== 1);
        do { d = ri(2, 6); c = ri(1, d - 1); } while (gcd(c, d) !== 1);
        var w = b * d * ri(1, 4), inner = w * c / d, ans = inner * a / b;
        return num('Work it out.', fr(a, b) + ' of ' + fr(c, d) + ' of ' + w, ans, s(ans),
          c + '/' + d + ' of ' + w + ' is ' + inner + ', and ' + a + '/' + b + ' of ' + inner + ' is ' + ans + '.');
      },
      function () {
        var list = [], seen = {};
        while (list.length < 4) {
          var d = ri(3, 12), n = ri(Math.ceil(d / 2), d - 1), key = (n / d).toFixed(3);
          if (gcd(n, d) !== 1 || seen[key]) continue;
          seen[key] = 1; list.push([n, d]);
        }
        var best = list.slice().sort(function (x, y) { return y[0] / y[1] - x[0] / x[1]; })[0];
        return choice('Which fraction is the largest?', '', frac(best[0], best[1]),
          list.filter(function (f) { return f !== best; }).map(function (f) { return frac(f[0], f[1]); }),
          'As decimals: ' + list.map(function (f) { return f[0] + '/' + f[1] + ' ≈ ' + (f[0] / f[1]).toFixed(3); }).join(', ') +
          '. The biggest is ' + best[0] + '/' + best[1] + '.');
      },
      function () {
        var a, b; do { a = ri(1, 5); b = ri(a + 1, 9); } while (gcd(a, b) !== 1);
        var each = ri(2, 12), total = (a + b) * each;
        return num('Share ' + money(total) + ' in the ratio ' + a + ' : ' + b + '. How big is the larger share?', '',
          b * each, money(b * each), a + ' + ' + b + ' = ' + (a + b) + ' parts, each worth ' + total + ' ÷ ' + (a + b) + ' = ' +
          each + ', so the larger share is ' + b + ' × ' + each + ' = ' + money(b * each) + '.', { unit: '$' });
      }
    ]
  };

  // ── Algebra ─────────────────────────────────────────────────────────────

  function either(u, v) {
    var lo = Math.min(u, v), hi = Math.max(u, v);
    return 'x = ' + s(lo) + ' or x = ' + s(hi);
  }
  function ineq(sym) { return sym === '<' ? '&lt;' : sym === '>' ? '&gt;' : sym; }

  var algebra = {
    easy: [
      function () {
        var form = ri(0, 3), x = ri(1, 20), a, expr, why;
        if (form === 0) {
          a = ri(2, 30); expr = 'x + ' + a + ' = ' + (x + a);
          why = 'Subtract ' + a + ' from both sides: x = ' + (x + a) + ' − ' + a + ' = ' + x + '.';
        } else if (form === 1) {
          a = ri(2, 30); expr = 'x − ' + a + ' = ' + s(x - a);
          why = 'Add ' + a + ' to both sides: x = ' + s(x - a) + ' + ' + a + ' = ' + x + '.';
        } else if (form === 2) {
          a = ri(2, 12); x = ri(2, 12); expr = a + 'x = ' + a * x;
          why = 'Divide both sides by ' + a + ': x = ' + a * x + ' ÷ ' + a + ' = ' + x + '.';
        } else {
          a = ri(2, 9); var b = ri(2, 12); x = a * b; expr = fr('x', a) + ' = ' + b;
          why = 'Multiply both sides by ' + a + ': x = ' + b + ' × ' + a + ' = ' + x + '.';
        }
        return num('Solve for x.', expr, x, s(x), why);
      },
      function () {
        var a = ri(2, 9), b = ri(1, 15), k = ri(1, 9), minus = coin(0.3), r = minus ? a * k - b : a * k + b;
        return num('Find the value when x = ' + k + '.', poly([a, minus ? -b : b]), r, s(r),
          a + ' × ' + k + (minus ? ' − ' : ' + ') + b + ' = ' + a * k + (minus ? ' − ' : ' + ') + b + ' = ' + s(r) + '.');
      },
      function () {
        var a = ri(2, 6), b = ri(2, 6), m = ri(1, 9), n = ri(1, 9), r = a * m + b * n;
        return num('Find the value when a = ' + m + ' and b = ' + n + '.', a + 'a + ' + b + 'b', r, s(r),
          a + ' × ' + m + ' + ' + b + ' × ' + n + ' = ' + a * m + ' + ' + b * n + ' = ' + r + '.');
      },
      function () {
        var a = ri(2, 9), c = ri(2, 9), b = ri(1, 12);
        return choice('Simplify.', a + 'x + ' + b + ' + ' + c + 'x', poly([a + c, b]),
          [poly([a + b + c, 0]), poly([a + c, 0]), poly([a * c, b]), poly([a + c, 0, b])],
          'Only like terms combine: ' + a + 'x + ' + c + 'x = ' + (a + c) + 'x, and the ' + b + ' stays as it is.');
      },
      function () {
        var a = ri(2, 6), b = ri(1, 10), x = ri(2, 10), c = a * x + b;
        return num('Solve for x.', poly([a, b]) + ' = ' + c, x, s(x),
          'Subtract ' + b + ': ' + a + 'x = ' + (c - b) + '. Divide by ' + a + ': x = ' + x + '.');
      }
    ],
    medium: [
      function () {
        var a; do { a = ri(-9, 9); } while (Math.abs(a) < 2);
        var x = ri(-10, 10), b = nz(-20, 20), c = a * x + b;
        return num('Solve for x.', poly([a, b]) + ' = ' + s(c), x, s(x),
          (b > 0 ? 'Subtract ' + b : 'Add ' + -b) + ' on both sides: ' + poly([a, 0]) + ' = ' + s(c - b) +
          '. Divide by ' + s(a) + ': x = ' + s(x) + '.');
      },
      function () {
        var a, c; do { a = ri(2, 9); c = ri(2, 9); } while (a === c);
        var x = ri(-8, 8), b = ri(-15, 15), d = a * x + b - c * x;
        return num('Solve for x.', poly([a, b]) + ' = ' + poly([c, d]), x, s(x),
          'Gather the x terms on one side: ' + poly([a - c, 0]) + ' = ' + s(d - b) + ', so x = ' + s(x) + '.');
      },
      function () {
        var a = ri(2, 9), b = nz(-9, 9), x = ri(-9, 12), c = a * (x + b);
        return num('Solve for x.', a + '(' + poly([1, b]) + ') = ' + s(c), x, s(x),
          'Divide both sides by ' + a + ': ' + poly([1, b]) + ' = ' + s(x + b) + ', then x = ' + s(x) + '.');
      },
      function () {
        var a; do { a = ri(-6, 9); } while (Math.abs(a) < 2);
        var b = ri(2, 9), c = nz(-9, 9);
        return choice('Expand.', s(a) + '(' + poly([b, c]) + ')', poly([a * b, a * c]),
          [poly([a * b, c]), poly([a + b, a * c]), poly([a * b, -a * c]), poly([b, a * c])],
          'Multiply each term inside by ' + s(a) + ': ' + s(a) + ' × ' + b + 'x = ' + poly([a * b, 0]) +
          ' and ' + s(a) + ' × ' + p(c) + ' = ' + s(a * c) + '.');
      },
      function () {
        var x1 = ri(-6, 6), x2; do { x2 = ri(-6, 6); } while (x2 === x1);
        var y1 = ri(-9, 9), y2 = ri(-9, 9), dy = y2 - y1, dx = x2 - x1;
        return num('What is the slope of the line through these points?', xy(x1, y1) + ' and ' + xy(x2, y2), dy / dx, ft(dy, dx),
          'Slope = rise ÷ run = (' + s(y2) + ' − ' + p(y1) + ') ÷ (' + s(x2) + ' − ' + p(x1) + ') = ' + s(dy) + ' ÷ ' + p(dx) +
          (Math.abs(gcd(dy, dx)) !== 1 || dx < 0 ? ' = ' + ft(dy, dx) : '') + '.');
      },
      function () {
        var a = ri(2, 9), x = ri(-6, 10), b = nz(-15, 15), c = a * x + b, sym = pick(['<', '>', '≤', '≥']);
        var flip = { '<': '>', '>': '<', '≤': '≥', '≥': '≤' }[sym], other = a * x !== x ? a * x : x + 2;
        return choice('Solve.', poly([a, b]) + ' ' + ineq(sym) + ' ' + s(c), 'x ' + ineq(sym) + ' ' + s(x),
          ['x ' + ineq(flip) + ' ' + s(x), 'x ' + ineq(sym) + ' ' + s(other), 'x ' + ineq(flip) + ' ' + s(other)],
          (b > 0 ? 'Subtract ' + b : 'Add ' + -b) + ': ' + a + 'x ' + ineq(sym) + ' ' + s(c - b) + '. Dividing by ' + a +
          ' (a positive number) keeps the sign: x ' + ineq(sym) + ' ' + s(x) + '.');
      },
      function () {
        var cost = ri(3, 15), fee = ri(2, 10), n = ri(2, 12), total = cost * n + fee;
        return num('Tickets cost ' + money(cost) + ' each, plus a ' + money(fee) + ' booking fee. The total was ' + money(total) +
          '. How many tickets were bought?', '', n, s(n),
          'Take off the fee: ' + total + ' − ' + fee + ' = ' + (total - fee) + ', then ' + (total - fee) + ' ÷ ' + cost + ' = ' + n + ' tickets.');
      }
    ],
    hard: [
      function () {
        var x = ri(-6, 9), y = ri(-6, 9);
        if (coin()) {
          return num('Solve the pair of equations. What is x?', lines('x + y = ' + s(x + y), 'x − y = ' + s(x - y)), x, s(x),
            'Add the equations to cancel y: 2x = ' + s(2 * x) + ', so x = ' + s(x) + ' (and y = ' + s(y) + ').');
        }
        var m, a; do { m = nz(-4, 4); a = ri(1, 5); } while (a + m === 0);
        var b = y - m * x, c = a * x + y;
        return num('Solve the pair of equations. What is x?', lines('y = ' + poly([m, b]), poly([a, 0]) + ' + y = ' + s(c)), x, s(x),
          'Put the first into the second: ' + poly([a + m, b]) + ' = ' + s(c) + ', so x = ' + s(x) + ' (and y = ' + s(y) + ').');
      },
      function () {
        var r1, r2; do { r1 = nz(-9, 9); r2 = nz(-9, 9); } while (r1 === r2 || r1 === -r2);
        return choice('Solve.', poly([1, -(r1 + r2), r1 * r2]) + ' = 0', either(r1, r2),
          [either(-r1, -r2), either(r1, -r2), either(-r1, r2)],
          'It factors as (' + poly([1, -r1]) + ')(' + poly([1, -r2]) + ') = 0, and a product is zero only when one of its parts is.');
      },
      function () {
        var a, b; do { a = nz(-9, 9); b = nz(-9, 9); } while (a === b || a === -b);
        function pair(u, v) { return '(' + poly([1, u]) + ')(' + poly([1, v]) + ')'; }
        return choice('Factor.', poly([1, a + b, a * b]), pair(a, b), [pair(-a, -b), pair(a, -b), pair(-a, b)],
          'Find two numbers that multiply to ' + s(a * b) + ' and add to ' + s(a + b) + ': ' + s(a) + ' and ' + s(b) + '.');
      },
      function () {
        var a, b; do { a = nz(-9, 9); b = nz(-9, 9); } while (a + b === 0);
        return choice('Expand.', '(' + poly([1, a]) + ')(' + poly([1, b]) + ')', poly([1, a + b, a * b]),
          [poly([1, a * b, a + b]), poly([1, 0, a * b]), poly([1, a + b, -a * b]), poly([1, -(a + b), a * b])],
          'Multiply every term by every term: x² + ' + s(a) + 'x + ' + p(b) + 'x + ' + p(a) + ' × ' + p(b) + ' = ' +
          poly([1, a + b, a * b]) + '.');
      },
      function () {
        var a = ri(2, 9), b = ri(2, 9);
        function pw(e) { return e === 1 ? 'x' : sup('x', e); }
        if (coin()) {
          var c = ri(1, a + b - 1), e = a + b - c;
          return choice('Simplify.', fr(pw(a) + ' · ' + pw(b), pw(c)), pw(e),
            [a * b - c, a + b + c, a + b, a * b].filter(function (k) { return k > 0 && k !== e; }).map(pw),
            'Add powers when multiplying and subtract when dividing: ' + a + ' + ' + b + ' − ' + c + ' = ' + e + '.');
        }
        return choice('Simplify.', '(' + pw(a) + ')<sup>' + b + '</sup>', pw(a * b),
          [a + b, a * b + 1, Math.pow(a, b) <= 99 ? Math.pow(a, b) : a * b - 1, a * b - 1].filter(function (k) { return k !== a * b; }).map(pw),
          'A power of a power multiplies: ' + a + ' × ' + b + ' = ' + a * b + '.');
      },
      function () {
        var a = nz(-9, 9), b = ri(1, 12);
        return choice('Solve.', '|' + poly([1, -a]) + '| = ' + b, either(a - b, a + b),
          [either(-a - b, b - a), 'x = ' + s(a + b), either(b, -b)],
          'Either ' + poly([1, -a]) + ' = ' + b + ' or ' + poly([1, -a]) + ' = −' + b + ', so x = ' + s(a + b) + ' or x = ' + s(a - b) + '.');
      },
      function () {
        var kind = ri(0, 2), a = ri(1, 3), b, c, d;
        if (kind === 0) {
          do { b = nz(-9, 9); c = nz(-9, 9); d = b * b - 4 * a * c; } while (d <= 0);
        } else if (kind === 1) {
          var r = nz(-5, 5); b = -2 * a * r; c = a * r * r; d = 0;
        } else {
          do { b = ri(-6, 6); c = ri(1, 12); d = b * b - 4 * a * c; } while (d >= 0);
        }
        return fixed('How many real solutions does this have?', poly([a, b, c]) + ' = 0', ['None', 'One', 'Two'], [2, 1, 0][kind],
          'b² − 4ac = ' + sup(p(b), 2) + ' − 4 × ' + a + ' × ' + p(c) + ' = ' + s(d) + ', which is ' +
          (d > 0 ? 'positive, so two.' : d === 0 ? 'zero, so one.' : 'negative, so none.'));
      },
      function () {
        var f = pick([
          { eq: 'A = lw', of: 'w', right: fr('A', 'l'), wrongs: [fr('l', 'A'), 'A − l', 'Al'], why: 'Divide both sides by l.' },
          { eq: 'P = 2l + 2w', of: 'l', right: fr('P − 2w', '2'), wrongs: [fr('P + 2w', '2'), 'P − 2w', fr('P', '2') + ' − 2w'], why: 'Subtract 2w, then divide by 2.' },
          { eq: 'y = mx + b', of: 'x', right: fr('y − b', 'm'), wrongs: [fr('y + b', 'm'), fr('y', 'm') + ' − b', 'm(y − b)'], why: 'Subtract b, then divide by m.' },
          { eq: 'C = 2πr', of: 'r', right: fr('C', '2π'), wrongs: [fr('2π', 'C'), 'C − 2π', '2πC'], why: 'Divide both sides by 2π.' },
          { eq: 'd = rt', of: 't', right: fr('d', 'r'), wrongs: [fr('r', 'd'), 'dr', 'd − r'], why: 'Divide both sides by r.' },
          { eq: 'V = lwh', of: 'h', right: fr('V', 'lw'), wrongs: [fr('lw', 'V'), 'V − lw', 'Vlw'], why: 'Divide both sides by lw.' }
        ]);
        return choice('Solve for ' + f.of + '.', f.eq, f.of + ' = ' + f.right,
          f.wrongs.map(function (w) { return f.of + ' = ' + w; }), f.why);
      }
    ]
  };

  // ── Functions ───────────────────────────────────────────────────────────

  function table(xs, ys) {
    function row(head, list) { return '<tr><th>' + head + '</th>' + list.map(function (v) { return '<td>' + s(v) + '</td>'; }).join('') + '</tr>'; }
    return '<table class="vals">' + row('x', xs) + row('y', ys) + '</table>';
  }

  var functions = {
    easy: [
      function () {
        var a = nz(-9, 9), b = nz(-12, 12), k = ri(-5, 9), r = a * k + b;
        return num('Find f(' + s(k) + ').', 'f(x) = ' + poly([a, b]), r, s(r),
          'Put ' + s(k) + ' in for x: ' + s(a) + ' × ' + p(k) + ' ' + signed(b) + ' = ' + s(r) + '.');
      },
      function () {
        var c = nz(-10, 10), k = nz(-6, 6), r = k * k + c;
        return num('Find f(' + s(k) + ').', 'f(x) = ' + poly([1, 0, c]), r, s(r),
          sup(p(k), 2) + ' = ' + k * k + ', and ' + k * k + ' ' + signed(c) + ' = ' + s(r) + '.');
      },
      function () {
        var m = nz(-9, 9), b = nz(-12, 12);
        if (coin()) {
          return num('What is the slope?', 'y = ' + poly([m, b]), m, s(m), 'In y = mx + b the number in front of x is the slope: ' + s(m) + '.');
        }
        return num('Where does the line cross the y-axis? Give the y-value.', 'y = ' + poly([m, b]), b, s(b),
          'On the y-axis x = 0, so y = ' + s(b) + '.');
      },
      function () {
        var a = ri(2, 5), b = ri(-5, 9), xs = [0, 1, 2, 3];
        var ys = xs.map(function (x) { return a * x + b; });
        return choice('Which rule makes this table?', table(xs, ys), 'y = ' + poly([a, b]),
          ['y = ' + poly([a + 1, b]), 'y = ' + poly([a - 1, b]), 'y = ' + poly([a + 1, b - 1]), 'y = ' + poly([a, b + a])],
          'Each step in x adds ' + a + ' to y, and y = ' + s(b) + ' when x = 0, so y = ' + poly([a, b]) + '.');
      },
      function () {
        var a = ri(2, 9), b = nz(-10, 10), x = ri(-5, 10), r = a * x + b;
        return num('For which x is f(x) = ' + s(r) + '?', 'f(x) = ' + poly([a, b]), x, s(x),
          'Solve ' + poly([a, b]) + ' = ' + s(r) + ': ' + a + 'x = ' + s(r - b) + ', so x = ' + s(x) + '.');
      }
    ],
    medium: [
      function () {
        var a = nz(-5, 5), b = nz(-9, 9), c = nz(-5, 5), d = nz(-9, 9), k = ri(-4, 5), gk = c * k + d, r = a * gk + b;
        return num('Find f(g(' + s(k) + ')).', lines('f(x) = ' + poly([a, b]), 'g(x) = ' + poly([c, d])), r, s(r),
          'Inside first: g(' + s(k) + ') = ' + s(gk) + '. Then f(' + s(gk) + ') = ' + s(r) + '.');
      },
      function () {
        var a = nz(-6, 9), b = nz(-10, 10), x = ri(-6, 9), r = a * x + b;
        return num('Find f<sup>−1</sup>(' + s(r) + ').', 'f(x) = ' + poly([a, b]), x, s(x),
          'f<sup>−1</sup>(' + s(r) + ') is the x that f sends to ' + s(r) + ': ' + poly([a, b]) + ' = ' + s(r) + ' gives x = ' + s(x) + '.');
      },
      function () {
        var a = nz(-8, 8), b = nz(-12, 12);
        return num('Where does the graph cross the x-axis? Give the x-value.', 'f(x) = ' + poly([a, b]), -b / a, ft(-b, a),
          'Set f(x) = 0: ' + poly([a, 0]) + ' = ' + s(-b) + ', so x = ' + ft(-b, a) + '.');
      },
      function () {
        var h = nz(-6, 6), c = ri(-10, 10);
        return num('At what x-value is the vertex?', 'f(x) = ' + poly([1, -2 * h, c]), h, s(h),
          'The vertex is at x = −b ÷ 2a = ' + s(2 * h) + ' ÷ 2 = ' + s(h) + '.');
      },
      function () {
        var a = nz(-9, 9);
        return num('Which value of x is not allowed?', 'f(x) = ' + fr('1', poly([1, -a])), a, s(a),
          'You cannot divide by zero, and ' + poly([1, -a]) + ' = 0 when x = ' + s(a) + '.');
      },
      function () {
        var m = nz(-5, 5), b = nz(-9, 9), x1 = ri(-3, 2), x2 = x1 + ri(1, 4), y1 = m * x1 + b, y2 = m * x2 + b;
        return choice('Which line goes through both points?', xy(x1, y1) + ' and ' + xy(x2, y2), 'y = ' + poly([m, b]),
          ['y = ' + poly([-m, b]), 'y = ' + poly([m, -b]), 'y = ' + poly([m, b + m]), 'y = ' + poly([b, m])],
          'Slope = ' + s(y2 - y1) + ' ÷ ' + s(x2 - x1) + ' = ' + s(m) + ', and putting in ' + xy(x1, y1) + ' gives b = ' + s(b) + '.');
      },
      function () {
        var a = nz(-3, 3), b = nz(-6, 6), c = ri(-9, 9), k = nz(-4, 4), r = a * k * k + b * k + c;
        return num('Find f(' + s(k) + ').', 'f(x) = ' + poly([a, b, c]), r, s(r),
          s(a) + ' × ' + sup(p(k), 2) + ' + ' + p(b) + ' × ' + p(k) + ' + ' + p(c) + ' = ' +
          s(a * k * k) + ' + ' + p(b * k) + ' + ' + p(c) + ' = ' + s(r) + '.');
      },
      function () {
        var a = ri(-3, 4), b = a + ri(1, 5);
        return num('Find the average rate of change from x = ' + s(a) + ' to x = ' + s(b) + '.', 'f(x) = x<sup>2</sup>', a + b, s(a + b),
          '(f(' + s(b) + ') − f(' + s(a) + ')) ÷ (' + s(b) + ' − ' + p(a) + ') = (' + b * b + ' − ' + a * a + ') ÷ ' + (b - a) +
          ' = ' + s(a + b) + '.');
      }
    ],
    hard: [
      function () {
        var a = nz(-9, 9), b = nz(-4, 4), c = nz(-6, 6), k = ri(-3, 4), fg = coin(), r, why;
        if (fg) {
          var gk = b * k + c; r = gk * gk + a;
          why = 'g(' + s(k) + ') = ' + s(gk) + ', then f(' + s(gk) + ') = ' + sup(p(gk), 2) + ' ' + signed(a) + ' = ' + s(r) + '.';
        } else {
          var fk = k * k + a; r = b * fk + c;
          why = 'f(' + s(k) + ') = ' + s(fk) + ', then g(' + s(fk) + ') = ' + s(b) + ' × ' + p(fk) + ' ' + signed(c) + ' = ' + s(r) + '.';
        }
        return num('Find ' + (fg ? 'f(g(' : 'g(f(') + s(k) + ')).', lines('f(x) = ' + poly([1, 0, a]), 'g(x) = ' + poly([b, c])), r, s(r), why);
      },
      function () {
        var a = ri(2, 9), b = nz(-9, 9);
        return choice('Which is the inverse, f<sup>−1</sup>(x)?', 'f(x) = ' + poly([a, b]), fr(poly([1, -b]), a),
          [fr(poly([1, b]), a), fr('x', a) + ' ' + signed(-b), fr('1', poly([a, b]))],
          'Swap x and y and solve: x = ' + poly([a, b], 'y') + ' gives y = (' + poly([1, -b]) + ') ÷ ' + a + '.');
      },
      function () {
        var h = nz(-6, 6), k = ri(-12, 12);
        return num('What is the smallest value f(x) can take?', 'f(x) = ' + poly([1, -2 * h, h * h + k]), k, s(k),
          'Complete the square: f(x) = (' + poly([1, -h]) + ')² ' + signed(k) + ', and a square is never below 0, so the minimum is ' + s(k) + '.');
      },
      function () {
        var base = pick([2, 3]), a = ri(1, 5), k = base === 2 ? ri(0, 6) : ri(0, 4), pow = Math.pow(base, k), r = a * pow;
        return num('Find f(' + k + ').', 'f(x) = ' + (a === 1 ? '' : a + ' · ') + sup(base, 'x'), r, s(r),
          sup(base, k) + ' = ' + pow + (a > 1 ? ', and ' + a + ' × ' + pow + ' = ' + r : '') + '.');
      },
      function () {
        var b = pick([2, 3, 5, 10]), top = { 2: 8, 3: 5, 5: 4, 10: 6 }[b], n = ri(-2, top);
        var arg = n >= 0 ? s(Math.pow(b, n)) : fr(1, Math.pow(b, -n));
        return num('Work it out.', 'log<sub>' + b + '</sub>(' + arg + ')', n, s(n),
          sup(b, s(n)) + ' = ' + (n >= 0 ? Math.pow(b, n) : '1/' + Math.pow(b, -n)) + ', so the answer is ' + s(n) + '.');
      },
      function () {
        var h = nz(-6, 6), k = nz(-6, 6);
        function move(x, y) { return (x > 0 ? 'Right ' : 'Left ') + Math.abs(x) + ', ' + (y > 0 ? 'up ' : 'down ') + Math.abs(y); }
        return choice('How is this graph moved from y = x²?', 'y = (' + poly([1, -h]) + ')<sup>2</sup> ' + signed(k), move(h, k),
          [move(-h, k), move(h, -k), move(-h, -k)],
          '(' + poly([1, -h]) + ') moves it ' + (h > 0 ? 'right ' : 'left ') + Math.abs(h) + ' (inside the bracket the sign flips), and ' +
          signed(k) + ' moves it ' + (k > 0 ? 'up ' : 'down ') + Math.abs(k) + '.');
      },
      function () {
        var kind = ri(0, 2), cs;
        if (kind === 0) cs = coin() ? [nz(-3, 3), 0, nz(-5, 5), 0, ri(-9, 9)] : [nz(-3, 3), 0, nz(-9, 9)];
        else if (kind === 1) cs = coin() ? [nz(-3, 3), 0, nz(-5, 5), 0] : [nz(-2, 2), 0, 0, 0, nz(-5, 5), 0];
        else cs = [nz(-3, 3), nz(-5, 5), nz(-9, 9)];
        return fixed('Is this function even, odd or neither?', 'f(x) = ' + poly(cs), ['Even', 'Odd', 'Neither'], kind,
          ['Every power of x is even (a number on its own counts as x⁰), so f(−x) = f(x).',
            'Every power of x is odd and there is no number on its own, so f(−x) = −f(x).',
            'It mixes even and odd powers, so it is neither.'][kind]);
      },
      function () {
        var a, c; do { a = nz(-6, 6); c = nz(-6, 6); } while (a === c);
        var x = ri(-6, 6), b = nz(-10, 10), d = a * x + b - c * x;
        return num('At what x-value do f and g meet?', lines('f(x) = ' + poly([a, b]), 'g(x) = ' + poly([c, d])), x, s(x),
          'Set them equal: ' + poly([a, b]) + ' = ' + poly([c, d]) + ', so ' + poly([a - c, 0]) + ' = ' + s(d - b) + ' and x = ' + s(x) + '.');
      }
    ]
  };

  // ── Geometry ────────────────────────────────────────────────────────────

  var TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15], [20, 21, 29], [9, 40, 41]];
  var SHAPES = { 3: 'equilateral triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: 'dodecagon' };

  // A right triangle with the right angle at C, for the trig question.
  function triangle(a, b, c) {
    return '<svg class="fig" viewBox="0 0 240 150" role="img" aria-label="Right triangle ABC with the right angle at C">' +
      '<path d="M30 120 L210 120 L30 24 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M30 106 H44 V120" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<text x="16" y="136">C</text><text x="216" y="136">A</text><text x="16" y="22">B</text>' +
      '<text x="120" y="142" class="len">' + b + '</text><text x="12" y="76" class="len">' + a + '</text>' +
      '<text x="128" y="64" class="len">' + c + '</text></svg>';
  }

  var geometry = {
    easy: [
      function () {
        var l = ri(3, 15), w = ri(2, 12), around = coin();
        return num('A rectangle is ' + l + ' cm long and ' + w + ' cm wide. What is its ' + (around ? 'perimeter' : 'area') + '?', '',
          around ? 2 * (l + w) : l * w, around ? 2 * (l + w) + ' cm' : l * w + ' cm²',
          around ? 'Perimeter = 2 × (' + l + ' + ' + w + ') = ' + 2 * (l + w) + ' cm.' : 'Area = ' + l + ' × ' + w + ' = ' + l * w + ' cm².',
          { unit: around ? 'cm' : 'cm²' });
      },
      function () {
        var a = ri(25, 100), b = ri(20, 150 - a), c = 180 - a - b;
        return num('Two angles of a triangle are ' + a + '° and ' + b + '°. What is the third angle?', '', c, c + '°',
          'The angles of a triangle add to 180°: 180 − ' + a + ' − ' + b + ' = ' + c + '°.', { unit: '°' });
      },
      function () {
        var straight = coin(), total = straight ? 180 : 90, a = straight ? ri(15, 165) : ri(10, 80);
        return num('Two angles add to ' + total + '°' + (straight ? ' (a straight line)' : ' (a right angle)') + '. One is ' + a + '°. What is the other?', '',
          total - a, total - a + '°', total + ' − ' + a + ' = ' + (total - a) + '°.', { unit: '°' });
      },
      function () {
        var b = ri(2, 16), h = ri(2, 14);
        if (b * h % 2) b += 1;
        return num('A triangle has a base of ' + b + ' cm and a height of ' + h + ' cm. What is its area?', '', b * h / 2, b * h / 2 + ' cm²',
          'Area = ½ × base × height = ½ × ' + b + ' × ' + h + ' = ' + b * h / 2 + ' cm².', { unit: 'cm²' });
      },
      function () {
        var side = ri(2, 12);
        if (coin()) {
          return num('A square has an area of ' + side * side + ' cm². How long is each side?', '', side, side + ' cm',
            side + ' × ' + side + ' = ' + side * side + ', so each side is ' + side + ' cm.', { unit: 'cm' });
        }
        return num('A square has a perimeter of ' + 4 * side + ' cm. How long is each side?', '', side, side + ' cm',
          'Four equal sides: ' + 4 * side + ' ÷ 4 = ' + side + ' cm.', { unit: 'cm' });
      },
      function () {
        var e = ri(2, 6), v = e * e * e;
        return num('A cube has edges ' + e + ' cm long. What is its volume?', '', v, v + ' cm³',
          e + ' × ' + e + ' × ' + e + ' = ' + v + ' cm³.', { unit: 'cm³' });
      },
      function () {
        var r = ri(2, 25);
        if (coin()) {
          return num('A circle has a radius of ' + r + ' cm. What is its diameter?', '', 2 * r, 2 * r + ' cm',
            'The diameter is two radii across: 2 × ' + r + ' = ' + 2 * r + ' cm.', { unit: 'cm' });
        }
        return num('A circle has a diameter of ' + 2 * r + ' cm. What is its radius?', '', r, r + ' cm',
          'The radius is half the diameter: ' + 2 * r + ' ÷ 2 = ' + r + ' cm.', { unit: 'cm' });
      }
    ],
    medium: [
      function () {
        var t = pick(TRIPLES), k = t[2] > 17 ? 1 : ri(1, 3), a = t[0] * k, b = t[1] * k, c = t[2] * k;
        if (coin(0.6)) {
          return num('A right triangle has legs of ' + a + ' and ' + b + '. How long is the hypotenuse?', '', c, s(c),
            sup(a, 2) + ' + ' + sup(b, 2) + ' = ' + a * a + ' + ' + b * b + ' = ' + c * c + ', and ' + root(c * c) + ' = ' + c + '.');
        }
        return num('A right triangle has a hypotenuse of ' + c + ' and one leg of ' + a + '. How long is the other leg?', '', b, s(b),
          sup(c, 2) + ' − ' + sup(a, 2) + ' = ' + c * c + ' − ' + a * a + ' = ' + b * b + ', and ' + root(b * b) + ' = ' + b + '.');
      },
      function () {
        var r = ri(2, 12), form = ri(0, 2);
        if (form === 0) {
          return num('A circle has a radius of ' + r + '. What is its area? Answer in terms of π.', '', r * r, r * r + 'π',
            'Area = πr² = π × ' + sup(r, 2) + ' = ' + r * r + 'π.', { unit: 'π' });
        }
        if (form === 1) {
          return num('A circle has a radius of ' + r + '. What is its circumference? Answer in terms of π.', '', 2 * r, 2 * r + 'π',
            'Circumference = 2πr = 2 × ' + r + ' × π = ' + 2 * r + 'π.', { unit: 'π' });
        }
        return num('A circle has a diameter of ' + 2 * r + '. What is its area? Answer in terms of π.', '', r * r, r * r + 'π',
          'The radius is half of ' + 2 * r + ', so ' + r + ', and πr² = ' + r * r + 'π.', { unit: 'π' });
      },
      function () {
        var l = ri(2, 12), w = ri(2, 10), h = ri(2, 10), v = l * w * h;
        return num('A box is ' + l + ' cm long, ' + w + ' cm wide and ' + h + ' cm tall. What is its volume?', '', v, v + ' cm³',
          l + ' × ' + w + ' × ' + h + ' = ' + v + ' cm³.', { unit: 'cm³' });
      },
      function () {
        var n = ri(5, 12), total = (n - 2) * 180;
        return num('What do the inside angles of a polygon with ' + n + ' sides add up to?', '', total, total + '°',
          '(sides − 2) × 180° = ' + (n - 2) + ' × 180 = ' + total + '°.', { unit: '°' });
      },
      function () {
        var n = pick([3, 4, 5, 6, 8, 9, 10, 12]), total = (n - 2) * 180, each = total / n;
        return num('What is each inside angle of a regular ' + SHAPES[n] + ' (' + n + ' sides)?', '', each, each + '°',
          'They add to ' + total + '°, shared by ' + n + ' equal angles: ' + total + ' ÷ ' + n + ' = ' + each + '°.', { unit: '°' });
      },
      function () {
        var t = pick(TRIPLES.slice(0, 5)), across = coin(), dx = (across ? t[0] : t[1]) * (coin() ? 1 : -1), dy = (across ? t[1] : t[0]) * (coin() ? 1 : -1);
        var x1 = ri(-5, 5), y1 = ri(-5, 5);
        return num('How far apart are these points?', xy(x1, y1) + ' and ' + xy(x1 + dx, y1 + dy), t[2], s(t[2]),
          'They are ' + Math.abs(dx) + ' across and ' + Math.abs(dy) + ' up or down, so ' + root(sup(Math.abs(dx), 2) + ' + ' + sup(Math.abs(dy), 2)) +
          ' = ' + root(t[2] * t[2]) + ' = ' + t[2] + '.');
      },
      function () {
        var a = ri(3, 12), b = ri(a + 1, 18), h = ri(2, 10);
        if ((a + b) * h % 2) h += 1;
        var area = (a + b) * h / 2;
        return num('A trapezoid has parallel sides of ' + a + ' cm and ' + b + ' cm, and a height of ' + h + ' cm. What is its area?', '',
          area, area + ' cm²', 'Area = ½ × (' + a + ' + ' + b + ') × ' + h + ' = ' + area + ' cm².', { unit: 'cm²' });
      }
    ],
    hard: [
      function () {
        var form = ri(0, 2), r, h, coef, why, what;
        if (form === 0) {
          r = ri(2, 8); h = ri(2, 12); coef = r * r * h; what = 'a cylinder with radius ' + r + ' and height ' + h;
          why = 'V = πr²h = π × ' + sup(r, 2) + ' × ' + h + ' = ' + coef + 'π.';
        } else if (form === 1) {
          r = ri(2, 8); do { h = ri(2, 12); } while (r * r * h % 3);
          coef = r * r * h / 3; what = 'a cone with radius ' + r + ' and height ' + h;
          why = 'V = ⅓πr²h = ⅓ × ' + r * r + ' × ' + h + ' × π = ' + coef + 'π.';
        } else {
          r = ri(1, 6); coef = 4 * r * r * r / 3; what = 'a sphere with radius ' + r;
          why = 'V = 4/3 × πr³ = 4/3 × ' + r * r * r + ' × π = ' + piText(4 * r * r * r, 3) + '.';
        }
        var show = piText(form === 2 ? 4 * r * r * r : coef, form === 2 ? 3 : 1);
        return num('What is the volume of ' + what + '? Answer in terms of π.', '', coef, show, why, { unit: 'π' });
      },
      function () {
        var r = ri(2, 12), deg = pick([30, 45, 60, 90, 120, 135, 150, 180, 240, 270]);
        if (coin()) {
          return num('A circle has radius ' + r + '. How long is the arc cut off by a ' + deg + '° angle at the centre? Answer in terms of π.', '',
            r * deg / 180, piText(r * deg, 180), 'Arc = ' + deg + '/360 of 2π × ' + r + ' = ' + piText(r * deg, 180) + '.', { unit: 'π' });
        }
        return num('A circle has radius ' + r + '. What is the area of a ' + deg + '° slice (sector)? Answer in terms of π.', '',
          r * r * deg / 360, piText(r * r * deg, 360), 'Sector = ' + deg + '/360 of π × ' + sup(r, 2) + ' = ' + piText(r * r * deg, 360) + '.', { unit: 'π' });
      },
      function () {
        var k = pick([2, 3, 4, 1.5, 2.5]), a, b;
        do { a = ri(2, 9); b = ri(2, 12); } while (a === b || (k % 1 && (a % 2 || b % 2)));
        return num('Two triangles are similar. The small one has sides of ' + a + ' and ' + b + '. On the big one the side matching ' + a +
          ' is ' + s(a * k) + '. How long is the side matching ' + b + '?', '', b * k, s(b * k),
          'The scale factor is ' + s(a * k) + ' ÷ ' + a + ' = ' + s(k) + ', so ' + b + ' × ' + s(k) + ' = ' + s(b * k) + '.');
      },
      function () {
        var n = ri(2, 12), form = ri(0, 2);
        if (form === 0) {
          return choice('A right triangle has two equal legs of ' + n + '. How long is the hypotenuse?', '', rt(n, 2),
            [rt(n, 3), s(2 * n), rt(2 * n, 2), s(n)], 'In a 45-45-90 triangle the hypotenuse is a leg × √2, so ' + n + '√2.');
        }
        if (form === 1) {
          return choice('A 30-60-90 triangle has a short leg of ' + n + '. How long is the long leg?', '', rt(n, 3),
            [rt(n, 2), s(2 * n), rt(2 * n, 3)], 'The long leg is the short leg × √3, so ' + n + '√3.');
        }
        return choice('A 30-60-90 triangle has a hypotenuse of ' + 2 * n + '. How long is the long leg?', '', rt(n, 3),
          [rt(2 * n, 3), rt(n, 2), s(n)], 'The short leg is half the hypotenuse, ' + n + ', and the long leg is that × √3: ' + n + '√3.');
      },
      function () {
        var t = pick(TRIPLES.slice(0, 6)), swap = coin(), a = swap ? t[1] : t[0], b = swap ? t[0] : t[1], c = t[2];
        var fn = pick(['sin', 'cos', 'tan']);
        var right = { sin: [a, c], cos: [b, c], tan: [a, b] }[fn];
        var rule = { sin: 'opposite ÷ hypotenuse', cos: 'adjacent ÷ hypotenuse', tan: 'opposite ÷ adjacent' }[fn];
        return choice('Find ' + fn + ' A.', triangle(a, b, c), frac(right[0], right[1]),
          [[a, c], [b, c], [a, b], [b, a]].map(function (f) { return frac(f[0], f[1]); }),
          'From A, BC = ' + a + ' is opposite, AC = ' + b + ' is adjacent and AB = ' + c + ' is the hypotenuse, so ' + fn + ' A = ' +
          rule + ' = ' + right[0] + '/' + right[1] + (gcd(right[0], right[1]) > 1 ? ' = ' + ft(right[0], right[1]) : '') + '.');
      },
      function () {
        var n = pick([3, 4, 5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36]);
        return num('What is each outside (exterior) angle of a regular polygon with ' + n + ' sides?', '', 360 / n, 360 / n + '°',
          'The exterior angles of any polygon add to 360°: 360 ÷ ' + n + ' = ' + 360 / n + '°.', { unit: '°' });
      },
      function () {
        var l = ri(2, 10), w = ri(2, 10), h = ri(2, 10), area = 2 * (l * w + l * h + w * h);
        return num('A box is ' + l + ' × ' + w + ' × ' + h + ' cm. What is its total surface area?', '', area, area + ' cm²',
          'Three pairs of faces: 2 × (' + l * w + ' + ' + l * h + ' + ' + w * h + ') = ' + area + ' cm².', { unit: 'cm²' });
      }
    ]
  };

  // ── Calculus basics ─────────────────────────────────────────────────────

  var calculus = {
    easy: [
      function () {
        var k = ri(-4, 5), b = nz(-9, 9), body, r;
        if (coin()) { var a = nz(-6, 6); body = poly([a, b]); r = a * k + b; }
        else { body = poly([1, 0, b]); r = k * k + b; }
        return num('Find the limit.', lim(s(k), '(' + body + ')'), r, s(r),
          'Nothing breaks at x = ' + s(k) + ', so put it straight in: ' + s(r) + '.');
      },
      function () {
        var a = nz(-9, 9), b = nz(-20, 20);
        return num('Find the derivative.', ddx(poly([a, b])), a, s(a),
          'A straight line has the same slope everywhere, ' + s(a) + ', and the constant ' + s(b) + ' adds nothing to it.');
      },
      function () {
        var n = ri(2, 9), c = ri(1, 6);
        return choice('Find the derivative.', ddx(term(c, n)), term(c * n, n - 1),
          [term(c, n - 1), term(c * n, n), term(c * n, n + 1), term(c * (n - 1), n - 1)],
          'Power rule: bring the power down and lower it by one. ' + c + ' × ' + n + ' = ' + c * n + ', and the power becomes ' + (n - 1) + '.');
      },
      function () {
        var a = nz(-5, 5), k = ri(-4, 5), r = 2 * a * k;
        return num('Find f′(' + s(k) + ').', 'f(x) = ' + poly([a, 0, 0]), r, s(r),
          'f′(x) = ' + poly([2 * a, 0]) + ', so f′(' + s(k) + ') = ' + s(2 * a) + ' × ' + p(k) + ' = ' + s(r) + '.');
      },
      function () {
        var n = ri(2, 6), c = ri(1, 4);
        return choice('Which function has this derivative?', term(c * n, n - 1), term(c, n),
          [term(c * n, n), term(c, n - 1), term(c * n * (n - 1), n - 2), term(c * n, n + 1)],
          'Check with the power rule: the derivative of ' + term(c, n) + ' is ' + term(c * n, n - 1) + '.');
      }
    ],
    medium: [
      function () {
        var a = nz(-3, 3), b = ri(-5, 5), c = ri(-9, 9), d = ri(-9, 9), k = ri(-3, 3), r = 3 * a * k * k + 2 * b * k + c;
        return num('Find f′(' + s(k) + ').', 'f(x) = ' + poly([a, b, c, d]), r, s(r),
          'f′(x) = ' + poly([3 * a, 2 * b, c]) + ', so f′(' + s(k) + ') = ' + s(r) + '.');
      },
      function () {
        var a = nz(-6, 6), b = ri(-6, 6);
        return num('Find the limit.', lim(s(a), fr(poly([1, b - a, -a * b]), poly([1, -a]))), a + b, s(a + b),
          'Putting x = ' + s(a) + ' in gives 0/0, so factor: (' + poly([1, -a]) + ')(' + poly([1, b]) + ') over (' + poly([1, -a]) +
          ') is ' + poly([1, b]) + ', which is ' + s(a + b) + ' at x = ' + s(a) + '.');
      },
      function () {
        var form = ri(0, 2), a = nz(-9, 9), c = ri(1, 9), b = ri(-9, 9), d = ri(-9, 9), top, bottom, ans, why;
        if (form === 0) { top = poly([a, 0, b]); bottom = poly([c, 0, d]); }
        else if (form === 1) { top = poly([a, b]); bottom = poly([c, 0, d]); }
        else { top = poly([a, 0, b, 0]); bottom = poly([c, 0, 0, d]); }
        if (form === 1) { ans = 0; why = 'The bottom grows faster (x² beats x), so the fraction shrinks towards 0.'; }
        else { ans = a / c; why = 'For huge x only the highest powers matter, and they match, so the limit is ' + s(a) + ' ÷ ' + c + ' = ' + ft(a, c) + '.'; }
        return num('Find the limit.', lim('∞', fr(top, bottom)), ans, form === 1 ? '0' : ft(a, c), why);
      },
      function () {
        var n = ri(1, 6), m = ri(1, 4), a = m * (n + 1);
        return choice('Which is the antiderivative?', integral(null, null, term(a, n)), term(m, n + 1) + ' + C',
          [term(a * n, n - 1) + ' + C', term(a, n + 1) + ' + C', term(m, n) + ' + C', term(a * (n + 1), n + 1) + ' + C'],
          'Raise the power by one and divide by the new power: ' + a + ' ÷ ' + (n + 1) + ' = ' + m + ', power ' + (n + 1) + '.');
      },
      function () {
        var form = ri(0, 2), a, b, k, c;
        if (form === 0) {
          a = ri(0, 3); b = ri(a + 1, 6);
          return num('Work it out.', integral(a, b, '2x'), b * b - a * a, s(b * b - a * a),
            'An antiderivative of 2x is x², so ' + sup(b, 2) + ' − ' + sup(a, 2) + ' = ' + (b * b - a * a) + '.');
        }
        if (form === 1) {
          k = ri(1, 4);
          return num('Work it out.', integral(0, k, '3x<sup>2</sup>'), k * k * k, s(k * k * k),
            'An antiderivative of 3x² is x³, so ' + sup(k, 3) + ' − 0 = ' + k * k * k + '.');
        }
        c = ri(2, 9); a = ri(0, 4); b = ri(a + 1, 8);
        return num('Work it out.', integral(a, b, String(c)), c * (b - a), s(c * (b - a)),
          'It is a rectangle ' + c + ' tall and ' + (b - a) + ' wide: ' + c + ' × ' + (b - a) + ' = ' + c * (b - a) + '.');
      },
      function () {
        var b = nz(-6, 6), c = ri(-9, 9), k = ri(-4, 4);
        return num('What is the slope of the tangent line at x = ' + s(k) + '?', 'y = ' + poly([1, b, c]), 2 * k + b, s(2 * k + b),
          'y′ = ' + poly([2, b]) + ', and at x = ' + s(k) + ' that is ' + s(2 * k + b) + '.');
      },
      function () {
        var a = ri(1, 5), b = ri(0, 12), k = ri(1, 6), v = 2 * a * k + b;
        return num('A ball\'s position is s(t) = ' + poly([a, b, 0], 't') + ' metres after t seconds. How fast is it going at t = ' + k + '?', '',
          v, v + ' m/s', 'Velocity is s′(t) = ' + poly([2 * a, b], 't') + ', which is ' + v + ' m/s at t = ' + k + '.', { unit: 'm/s' });
      }
    ],
  };
})();

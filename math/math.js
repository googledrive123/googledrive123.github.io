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
})();

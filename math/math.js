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
  };
})();

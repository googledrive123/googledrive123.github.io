/* GameVault profile pictures.
   42 built-in avatars, each drawn here from its number as a small SVG, plus
   the account's own uploaded picture once the site owner has approved it (see
   sql/avatars.sql). Guests have no account row, so the avatar they pick stays
   in this browser under 'gv.avatar'.

   Public surface: window.GV.avatars. */
(function () {
  'use strict';

  var COUNT = 42;

  // ─── Drawing ───
  // Every avatar is drawn on a 64x64 square and shown in a circle, so
  // anything that matters stays near the middle.
  var INK = '#2a2230';
  var BLUSH = '#ff8fa3';

  function n(v) { return Math.round(v * 100) / 100; }
  function c(x, y, r, f) {
    return '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(r) + '" fill="' + f + '"/>';
  }
  function e(x, y, rx, ry, f, rot, op) {
    return '<ellipse cx="' + n(x) + '" cy="' + n(y) + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"' +
      (rot ? ' transform="rotate(' + rot + ' ' + n(x) + ' ' + n(y) + ')"' : '') +
      (op ? ' opacity="' + op + '"' : '') + '/>';
  }
  function p(d, f) { return '<path d="' + d + '" fill="' + f + '"/>'; }
  function r(x, y, w, h, rx, f) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '" fill="' + f + '"/>';
  }
  function s(d, col, w) {
    return '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (w || 2) +
      '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  // A shape and its mirror image across the middle.
  function both(fn, x) { return fn(x) + fn(64 - x); }

  function eye(x, y, rad, col) {
    return c(x, y, rad, col || INK) + c(x - rad * 0.35, y - rad * 0.4, rad * 0.38, '#fff');
  }
  function eyes(y, gap, rad, col) { return eye(32 - gap, y, rad, col) + eye(32 + gap, y, rad, col); }
  function cheeks(y, gap, col) {
    return e(32 - gap, y, 3.2, 2, col || BLUSH, 0, 0.6) + e(32 + gap, y, 3.2, 2, col || BLUSH, 0, 0.6);
  }
  function shoulders(col, y) { return e(32, y || 66, 19, 12, col); }

  // [name, background, drawing]
  var ART = [
    ['Cat', '#6ecbc1', function () {
      var fur = '#f59e42';
      return shoulders(fur) +
        p('M13 30 L16 9 L30 20 Z', fur) + p('M51 30 L48 9 L34 20 Z', fur) +
        p('M17 25 L18.5 14 L26 20 Z', '#ffc9a8') + p('M47 25 L45.5 14 L38 20 Z', '#ffc9a8') +
        e(32, 37, 20, 17, fur) +
        s('M32 21 V26 M27 22 L28 25.5 M37 22 L36 25.5', '#d9792a', 2) +
        eyes(35, 8, 3.2) + cheeks(42, 12) +
        p('M30 40.5 H34 L32 43 Z', '#e8677a') +
        s('M28.5 44 Q30.3 46.5 32 44 Q33.7 46.5 35.5 44', INK, 1.5) +
        s('M8 39 L19 40.5 M8 45 L19 43.5 M56 39 L45 40.5 M56 45 L45 43.5', '#fff', 1.1);
    }],
    ['Dog', '#ffd166', function () {
      var fur = '#c68b59';
      return shoulders(fur) + e(32, 36, 17, 18, fur) +
        e(40, 31, 6, 5.5, '#a8703f') +
        e(15, 33, 6, 13, '#7a4b2a', 15) + e(49, 33, 6, 13, '#7a4b2a', -15) +
        e(32, 44, 9, 7, '#f3dcc0') +
        p('M30 46 H34 V48.5 A2 2 0 0 1 30 48.5 Z', '#ff6b81') +
        e(32, 40.5, 3.6, 2.6, INK) +
        eyes(32, 7, 3) +
        s('M28 45 Q30 47.5 32 45 Q34 47.5 36 45', INK, 1.5);
    }],
    ['Bear', '#8fc9f2', function () {
      var fur = '#8b5e3c';
      return both(function (x) { return c(x, 21, 7, fur) + c(x, 21, 3.5, '#c49a6c'); }, 17) +
        shoulders(fur) + c(32, 37, 19, fur) +
        e(32, 44, 9, 7, '#d9b38c') + e(32, 41, 3.5, 2.5, INK) +
        eyes(34, 7.5, 3) + cheeks(40, 12.5) +
        s('M29 45.5 Q32 48.5 35 45.5', INK, 1.6);
    }],
    ['Bunny', '#b9a5e0', function () {
      var fur = '#f7f4f0';
      return e(24, 17, 5.5, 14, fur, -8) + e(40, 17, 5.5, 14, fur, 8) +
        e(24, 18, 2.6, 10, '#ffb3c6', -8) + e(40, 18, 2.6, 10, '#ffb3c6', 8) +
        shoulders(fur) + c(32, 40, 16, fur) +
        eyes(38, 6.5, 3) + cheeks(44, 10, '#ffb3c6') +
        p('M30.3 42.5 H33.7 L32 44.5 Z', '#ff8fab') +
        s('M29.5 46 Q31 48 32 46 Q33 48 34.5 46', INK, 1.4);
    }],
    ['Fox', '#2f6f94', function () {
      var fur = '#f28c28', cream = '#fff4e6';
      return shoulders(fur) + e(32, 64, 8, 8, cream) +
        p('M14 32 L17 8 L31 21 Z', fur) + p('M50 32 L47 8 L33 21 Z', fur) +
        p('M16.2 17 L17 8 L23.5 14 Z', '#3b2418') + p('M47.8 17 L47 8 L40.5 14 Z', '#3b2418') +
        p('M12 32 Q14 18 32 18 Q50 18 52 32 Q50 46 32 54 Q14 46 12 32 Z', fur) +
        p('M13 34 Q24 34 32 42 Q40 34 51 34 Q48 46 32 54 Q16 46 13 34 Z', cream) +
        eyes(31, 8, 3) +
        e(32, 45, 3, 2.3, INK);
    }],
    ['Panda', '#9fdc93', function () {
      var dark = '#2b2b2b';
      return both(function (x) { return c(x, 22, 7, dark); }, 17) +
        shoulders(dark) + e(32, 38, 19, 17, '#fafafa') +
        e(24, 36, 5, 6.5, dark, 30) + e(40, 36, 5, 6.5, dark, -30) +
        c(24.5, 35.5, 2.3, '#fff') + c(39.5, 35.5, 2.3, '#fff') +
        c(24.8, 35.9, 1.3, dark) + c(39.8, 35.9, 1.3, dark) +
        cheeks(44, 12) +
        e(32, 42, 3, 2.2, dark) +
        s('M29 45 Q30.5 47 32 45 Q33.5 47 35 45', dark, 1.4);
    }],
    ['Frog', '#ffb8c6', function () {
      var skin = '#6cc551', dark = '#2f6b2f';
      return shoulders('#5cb85c') + e(32, 42, 22, 15, skin) +
        c(21, 27, 8, skin) + c(43, 27, 8, skin) +
        c(21, 27, 5.6, '#fff') + c(43, 27, 5.6, '#fff') +
        c(21.5, 28, 3, INK) + c(42.5, 28, 3, INK) +
        c(20.4, 26.8, 1.1, '#fff') + c(41.4, 26.8, 1.1, '#fff') +
        c(29.5, 38, 0.9, dark) + c(34.5, 38, 0.9, dark) +
        cheeks(46, 15) +
        s('M20 44 Q32 53 44 44', dark, 2.2);
    }],
    ['Owl', '#f4a261', function () {
      var body = '#6d4c41';
      return p('M13 66 Q11 32 18 20 L15 9 L25 16 Q32 14 39 16 L49 9 L46 20 Q53 32 51 66 Z', body) +
        e(32, 55, 12, 12, '#a1887f') +
        s('M27 50 l2 2 2 -2 M33 50 l2 2 2 -2 M30 55 l2 2 2 -2', body, 1.2) +
        c(24, 31, 8.5, '#fff3e0') + c(40, 31, 8.5, '#fff3e0') +
        eye(24, 31, 4.5) + eye(40, 31, 4.5) +
        p('M29 36 L35 36 L32 42 Z', '#ffb300');
    }],
    ['Penguin', '#6fd3e8', function () {
      return p('M12 66 Q10 26 32 16 Q54 26 52 66 Z', '#2b2d42') +
        p('M32 26 Q22 17 18 30 Q16 44 32 50 Q48 44 46 30 Q42 17 32 26 Z', '#fff') +
        e(32, 64, 10, 8, '#fff') +
        eyes(33, 6.5, 3) + cheeks(40, 10) +
        p('M28.5 38 H35.5 L32 42.5 Z', '#ffa630');
    }],
    ['Robot', '#ef476f', function () {
      var metal = '#cfd8dc', dark = '#90a4ae';
      return s('M32 10 V17', dark, 2) + c(32, 9, 3, '#ffd166') +
        r(10, 31, 5, 10, 2, dark) + r(49, 31, 5, 10, 2, dark) +
        r(18, 54, 28, 14, 5, '#b0bec5') +
        r(14, 17, 36, 34, 9, metal) +
        r(19, 24, 26, 15, 6, '#263238') +
        c(26, 31.5, 3.6, '#5ee7ff') + c(38, 31.5, 3.6, '#5ee7ff') +
        c(25, 30.4, 1.2, '#fff') + c(37, 30.4, 1.2, '#fff') +
        r(24, 43, 16, 5, 2, dark) + s('M28 43.5 V47.5 M32 43.5 V47.5 M36 43.5 V47.5', '#607d8b', 1.2) +
        e(19.5, 45.5, 2.4, 1.5, BLUSH, 0, 0.8) + e(44.5, 45.5, 2.4, 1.5, BLUSH, 0, 0.8);
    }],
    ['Alien', '#4b2bb3', function () {
      var skin = '#80ed99';
      return s('M24 16 L19 7 M40 16 L45 7', skin, 2) + c(19, 7, 2.6, '#ffd166') + c(45, 7, 2.6, '#ffd166') +
        e(32, 66, 15, 10, '#57cc99') +
        p('M32 12 C50 12 54 27 50 38 C46 50 38 56 32 56 C26 56 18 50 14 38 C10 27 14 12 32 12 Z', skin) +
        e(23, 35, 7, 4.6, INK, 25) + e(41, 35, 7, 4.6, INK, -25) +
        c(21, 33.5, 1.5, '#fff') + c(39, 33.5, 1.5, '#fff') +
        s('M29 47 Q32 49 35 47', '#2d6a4f', 1.6);
    }],
    ['Monster', '#7bdcb5', function () {
      var fur = '#9b5de5';
      return p('M18 23 L14 8 L25 18 Z', '#fff8e7') + p('M46 23 L50 8 L39 18 Z', '#fff8e7') +
        shoulders(fur) + c(32, 38, 20, fur) +
        c(19, 45, 2.5, '#b784f0') + c(46, 29, 2, '#b784f0') + c(44, 50, 1.6, '#b784f0') +
        c(32, 33, 9, '#fff') + eye(32.5, 34, 4.6) +
        p('M22 45 Q32 56 42 45 Z', '#3c1a5b') +
        p('M26 45.5 L28 49.5 L30 46.4 Z M34 46.4 L36 49.5 L38 45.5 Z', '#fff');
    }],
    ['Ghost', '#5470f0', function () {
      return p('M14 58 V32 A18 18 0 0 1 50 32 V58 L44 53 L38 58 L32 53 L26 58 L20 53 Z', '#f8f9fa') +
        e(25.5, 33, 3, 4, INK) + e(38.5, 33, 3, 4, INK) +
        c(24.6, 31.6, 1.1, '#fff') + c(37.6, 31.6, 1.1, '#fff') +
        cheeks(39.5, 11) +
        e(32, 42, 2.6, 3.2, INK);
    }]
  ];

  function index(i) {
    i = Math.floor(Number(i));
    return isFinite(i) ? ((i % COUNT) + COUNT) % COUNT : 0;
  }

  function svg(i) {
    var a = ART[index(i)];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" ' +
      'aria-hidden="true" focusable="false" style="display:block">' +
      '<rect width="64" height="64" fill="' + a[1] + '"/>' + a[2]() + '</svg>';
  }

  function name(i) { return ART[index(i)][0]; }

  window.GV = window.GV || {};
  window.GV.avatars = {
    count: COUNT,
    svg: svg,
    name: name
  };
})();

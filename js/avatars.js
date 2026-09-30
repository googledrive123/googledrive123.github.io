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

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

  function starPath(cx, cy, R, rin, points) {
    var d = '';
    for (var k = 0; k < points * 2; k++) {
      var a = (-90 + k * 180 / points) * Math.PI / 180;
      var rad = k % 2 ? rin : R;
      d += (k ? 'L' : 'M') + n(cx + rad * Math.cos(a)) + ' ' + n(cy + rad * Math.sin(a)) + ' ';
    }
    return d + 'Z';
  }

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
    }],
    ['Slime', '#c7f464', function () {
      var goo = '#4cc9f0';
      return p('M8 66 Q8 22 32 18 Q56 22 56 66 Z', goo) +
        c(15, 60, 5, goo) + c(49, 58, 4, goo) +
        e(21, 28, 4.5, 2.5, '#fff', -30, 0.6) +
        eyes(38, 8, 3.4) + cheeks(44, 14) +
        p('M26 45 Q32 53 38 45 Z', INK) + e(32, 49, 2.5, 1.3, '#ff6b81');
    }],
    ['Chick', '#5a9cf8', function () {
      var fluff = '#ffd23f';
      return s('M32 20 Q28 11 24 13 M32 20 Q33 10 38 11', '#ffb703', 2.4) +
        e(13, 46, 4, 7, '#ffc300', 20) + e(51, 46, 4, 7, '#ffc300', -20) +
        c(32, 40, 20, fluff) +
        eyes(36, 7, 3) + cheeks(43, 12) +
        p('M28.5 41 L32 38.5 L35.5 41 L32 44.5 Z', '#fb8500');
    }],
    ['Koala', '#a8dcc9', function () {
      var fur = '#9aa5b1';
      return both(function (x) { return c(x, 27, 10, fur) + c(x, 27, 6, '#e5e9ec'); }, 14) +
        shoulders(fur) + e(32, 39, 17, 16, fur) +
        eyes(35, 8, 2.7) + cheeks(45, 11, '#f4a7b9') +
        e(32, 42, 4, 5.5, '#3a3a48') + e(30.8, 40, 1, 1.8, '#6b6b7b') +
        s('M29.5 49.8 Q32 51.2 34.5 49.8', INK, 1.4);
    }],
    ['Mouse', '#ffc2a8', function () {
      var fur = '#b0b7c3';
      return both(function (x) { return c(x, 22, 11, fur) + c(x, 22, 7, '#ffc8dd'); }, 15) +
        e(32, 66, 16, 11, fur) + e(32, 40, 16, 15, fur) +
        eyes(37, 6, 2.8) +
        s('M12 42 L22 43.5 M12 47 L22 46 M52 42 L42 43.5 M52 47 L42 46', '#6b7280', 1.1) +
        c(32, 44, 2.4, '#ff6b9a') +
        s('M30 47.5 Q32 49.5 34 47.5', INK, 1.3);
    }],
    ['Pig', '#7fa8ff', function () {
      var skin = '#ffb3c6', dark = '#ff8fab';
      return p('M13 28 L15 12 L27 20 Z', dark) + p('M51 28 L49 12 L37 20 Z', dark) +
        shoulders(skin) + c(32, 38, 19, skin) +
        eyes(33, 8, 2.8) + cheeks(42, 13, '#ff7096') +
        e(32, 42, 7, 5, dark) + e(29.5, 42, 1.2, 1.8, '#c9184a') + e(34.5, 42, 1.2, 1.8, '#c9184a') +
        s('M28.5 49 Q32 51.5 35.5 49', INK, 1.5);
    }],
    ['Lion', '#06c79a', function () {
      var mane = '#c1440e', fur = '#f4a340', out = e(32, 68, 18, 10, fur) + c(32, 36, 20, mane);
      for (var k = 0; k < 12; k++) {
        var a = k * Math.PI / 6;
        out += c(32 + 18 * Math.cos(a), 36 + 18 * Math.sin(a), 7.5, mane);
      }
      return out + c(20, 24, 4.5, fur) + c(44, 24, 4.5, fur) +
        c(32, 38, 14, fur) + e(32, 44, 7, 5, '#ffd6a0') +
        eyes(35, 5.5, 2.6) +
        p('M29.5 41 H34.5 L32 43.8 Z', INK) +
        s('M29 46.5 Q30.5 48 32 46.3 Q33.5 48 35 46.5', INK, 1.3);
    }],
    ['Octopus', '#ffe08a', function () {
      var skin = '#f15bb5';
      return s('M20 46 Q12 54 16 62 M27 50 Q24 58 27 64 M37 50 Q40 58 37 64 M44 46 Q52 54 48 62', skin, 6) +
        p('M12 40 Q12 12 32 12 Q52 12 52 40 Q52 52 32 52 Q12 52 12 40 Z', skin) +
        c(22, 22, 2.2, '#f78fd0') + c(42, 20, 1.6, '#f78fd0') + c(45, 27, 1.2, '#f78fd0') +
        eyes(35, 7, 3.2) + cheeks(41, 12.5, '#ffd1ea') +
        s('M28.5 42 Q32 45.5 35.5 42', INK, 1.8);
    }],
    ['Dino', '#ff9f9f', function () {
      var skin = '#57cc99', dark = '#2d6a4f', spike = '#f9844a';
      return p('M19 24 L21 12 L28 20 Z', spike) + p('M27.5 20 L32 8 L36.5 20 Z', spike) + p('M36 20 L43 12 L45 24 Z', spike) +
        shoulders(skin) + e(32, 39, 19, 18, skin) +
        e(32, 47, 12, 7, '#b8f2cf') +
        c(18, 36, 2, '#80ed99') + c(46, 31, 2.4, '#80ed99') +
        eyes(33, 8.5, 3) +
        c(29, 40, 1, dark) + c(35, 40, 1, dark) +
        s('M23 45 Q32 53 41 45', dark, 2);
    }],
    ['Unicorn', '#8f7fe0', function () {
      var coat = '#fff7fb';
      return c(15, 29, 7, '#ff99c8') + c(14, 39, 6, '#c77dff') + c(17, 48, 5.5, '#7ee8fa') +
        p('M20 27 L21 14 L28 22 Z', coat) + p('M44 27 L43 14 L36 22 Z', coat) +
        p('M28.5 21 L32 3 L35.5 21 Z', '#ffd166') + s('M29.7 16 L34 14.2 M30.6 11 L33.4 9.8', '#f4a261', 1.3) +
        shoulders(coat) + c(32, 38, 17, coat) +
        c(27, 23, 4.5, '#ff99c8') + c(33.5, 22, 4, '#c77dff') +
        s('M22 37 Q25 34 28 37 M36 37 Q39 34 42 37', INK, 2) +
        cheeks(42, 11, '#ff99c8') +
        s('M28.5 44 Q32 47 35.5 44', INK, 1.7);
    }],
    ['Tiger', '#2d7ff9', function () {
      var fur = '#fb8500', stripe = '#3d2314', white = '#fff1e6';
      return both(function (x) { return c(x, 22, 6.5, fur) + c(x, 22, 3.2, white); }, 17) +
        shoulders(fur) + e(32, 38, 19, 17, fur) +
        s('M32 21.5 V27 M27 22.5 L28.5 26.5 M37 22.5 L35.5 26.5', stripe, 2) +
        s('M13.5 36 H19 M14 41 L19.5 40 M50.5 36 H45 M50 41 L44.5 40', stripe, 2) +
        e(27.5, 44, 5.5, 4.5, white) + e(36.5, 44, 5.5, 4.5, white) +
        eyes(34, 7.5, 2.9) +
        p('M29.5 40.5 H34.5 L32 43.3 Z', '#ff7b8a') +
        s('M30 46 Q32 47.5 34 46', INK, 1.3);
    }],
    ['Monkey', '#f2b8ff', function () {
      var fur = '#7f5539', face = '#e6ccb2';
      return both(function (x) { return c(x, 37, 6.5, fur) + c(x, 37, 3.8, face); }, 13) +
        shoulders(fur) + c(32, 37, 19, fur) +
        p('M29 19 Q31 13 35 14 Q32 16 34 19 Z', fur) +
        c(26.5, 34, 7, face) + c(37.5, 34, 7, face) + e(32, 44, 11, 8, face) +
        eyes(34, 5.8, 2.6) +
        c(30.5, 42, 0.9, INK) + c(33.5, 42, 0.9, INK) +
        s('M26.5 45.5 Q32 51 37.5 45.5', INK, 1.7);
    }],
    ['Cow', '#9bd36b', function () {
      var hide = '#f5f5f5', spot = '#2b2b2b', nose = '#ffb3c6';
      return p('M18 22 Q12 18 13 11 Q18 18 23 19 Z', '#f1e3c8') + p('M46 22 Q52 18 51 11 Q46 18 41 19 Z', '#f1e3c8') +
        e(12, 31, 7, 3.5, hide, 20) + e(52, 31, 7, 3.5, hide, -20) +
        e(12, 31, 4, 1.8, nose, 20) + e(52, 31, 4, 1.8, nose, -20) +
        shoulders(hide) + e(32, 36, 17, 17, hide) +
        e(22, 27, 5, 4, spot, -20) + e(42.5, 24, 3.5, 3, spot) + e(25, 62, 4, 3, spot) +
        eyes(34, 7.5, 2.8) +
        e(32, 46, 12, 8, nose) +
        e(27.5, 45.5, 1.8, 2.3, '#c9184a') + e(36.5, 45.5, 1.8, 2.3, '#c9184a') +
        s('M29 50 Q32 52 35 50', '#c9184a', 1.4);
    }],
    ['Raccoon', '#ffb3a7', function () {
      var fur = '#8d99ae', mask = '#2b2d42', white = '#edf2f4';
      return p('M13 30 L15 13 L28 21 Z', fur) + p('M51 30 L49 13 L36 21 Z', fur) +
        p('M16.5 26 L17.5 17 L24.5 21.5 Z', mask) + p('M47.5 26 L46.5 17 L39.5 21.5 Z', mask) +
        shoulders(fur) + e(32, 38, 20, 17, fur) +
        e(32, 44, 11, 9, white) + e(24, 28, 5, 2.5, white) + e(40, 28, 5, 2.5, white) +
        p('M11 36 Q20 29 32 36 Q44 29 53 36 Q44 42 32 39 Q20 42 11 36 Z', mask) +
        c(24, 35.5, 3, '#fff') + c(40, 35.5, 3, '#fff') +
        c(24.3, 35.8, 1.8, INK) + c(40.3, 35.8, 1.8, INK) +
        e(32, 42.5, 3, 2.2, INK) +
        s('M29.5 46 Q31 47.8 32 46 Q33 47.8 34.5 46', INK, 1.3);
    }],
    ['Hamster', '#9d4edd', function () {
      var fur = '#f6bd60', white = '#fff4e0';
      return both(function (x) { return c(x, 22, 5, fur) + c(x, 22, 2.6, '#ffb3c6'); }, 18) +
        e(32, 66, 20, 13, fur) + e(32, 39, 20, 18, fur) +
        e(32, 50, 8, 7, white) + e(19, 45, 8, 7, white) + e(45, 45, 8, 7, white) +
        eyes(35, 7, 2.6) + cheeks(44, 13) +
        e(32, 40.5, 1.8, 1.3, '#ff8fab') +
        s('M30 43 Q31 44.5 32 43 Q33 44.5 34 43', INK, 1.2);
    }],
    ['Axolotl', '#20b2a6', function () {
      var skin = '#ffc8dd', gill = '#ff70a6';
      return both(function (x) {
        var m = x < 32 ? 1 : -1;
        return s('M' + x + ' 32 Q' + (x - 7 * m) + ' 28 ' + (x - 8 * m) + ' 22', gill, 4) +
          s('M' + (x - m) + ' 38 Q' + (x - 8 * m) + ' 38 ' + (x - 10 * m) + ' 34', gill, 4) +
          s('M' + x + ' 44 Q' + (x - 6 * m) + ' 48 ' + (x - 8 * m) + ' 52', gill, 4);
      }, 13) +
        e(32, 66, 17, 11, skin) + e(32, 40, 21, 16, skin) +
        eyes(38, 11, 2.7) + cheeks(44, 13, '#ff8fab') +
        s('M28 44 Q32 47.5 36 44', INK, 1.6);
    }],
    ['Bee', '#3fa7d6', function () {
      var gold = '#ffd60a';
      return e(17, 42, 8, 11, '#fff', -25, 0.8) + e(47, 42, 8, 11, '#fff', 25, 0.8) +
        e(32, 66, 18, 13, INK) + s('M17 59 Q32 54 47 59', gold, 3.5) +
        s('M26 21 Q24 12 20 10 M38 21 Q40 12 44 10', INK, 1.8) + c(20, 10, 2.4, INK) + c(44, 10, 2.4, INK) +
        c(32, 35, 16, gold) +
        eyes(34, 6, 2.8) + cheeks(40, 10) +
        s('M28.5 40.5 Q32 44 35.5 40.5', INK, 1.7);
    }],
    ['Ladybug', '#8fbf5a', function () {
      var shell = '#e63946', dark = '#1d1d1d';
      return s('M25 21 Q22 12 18 11 M39 21 Q42 12 46 11', dark, 1.8) + c(18, 11, 2, dark) + c(46, 11, 2, dark) +
        c(32, 40, 20, shell) +
        s('M32 30 V60', dark, 1.8) +
        c(22, 42, 3.5, dark) + c(42, 42, 3.5, dark) + c(25, 53, 2.8, dark) + c(39, 53, 2.8, dark) +
        p('M16 32 A16 13 0 0 1 48 32 Q32 36 16 32 Z', dark) +
        c(26, 26, 3.4, '#fff') + c(38, 26, 3.4, '#fff') +
        c(26.5, 26.5, 1.9, INK) + c(38.5, 26.5, 1.9, INK) +
        s('M29 30 Q32 32.5 35 30', '#fff', 1.4);
    }],
    ['Shark', '#ffb49a', function () {
      var skin = '#6c8ebf';
      return p('M28 18 L36 4 L38 19 Z', '#5c7ea8') +
        shoulders(skin) + e(32, 38, 20, 19, skin) +
        p('M13 40 Q32 50 51 40 Q50 54 32 57 Q14 54 13 40 Z', '#eaf2fb') +
        eyes(33, 9, 2.8) +
        p('M22 43 Q32 53 42 43 Z', INK) +
        p('M24 43.5 L26 46.5 L28 44.2 Z M30 44.6 L32 47.8 L34 44.6 Z M36 44.2 L38 46.5 L40 43.5 Z', '#fff');
    }],
    ['Whale', '#bfeaf5', function () {
      var blue = '#0077b6';
      return s('M32 21 Q32 12 25 9 M32 21 Q32 12 39 9', '#48cae4', 2.5) +
        p('M8 66 Q6 24 32 22 Q58 24 56 66 Z', blue) +
        e(32, 58, 15, 9, '#90e0ef') +
        s('M24 53 V62 M28 52 V63 M32 52 V63 M36 52 V63 M40 53 V62', '#48cae4', 1.2) +
        eyes(38, 10, 2.8) + cheeks(43, 15) +
        s('M24 44 Q32 49 40 44', '#023e8a', 1.8);
    }],
    ['Dragon', '#3c4f76', function () {
      var scale = '#e63946', dark = '#7a0c16';
      return p('M20 24 Q14 14 16 6 Q20 16 26 20 Z', '#ffd166') + p('M44 24 Q50 14 48 6 Q44 16 38 20 Z', '#ffd166') +
        p('M14 34 L4 27 L9 41 Z', '#b5172b') + p('M50 34 L60 27 L55 41 Z', '#b5172b') +
        shoulders(scale) + e(32, 38, 19, 18, scale) +
        e(32, 46, 11, 7, '#ff6b6b') +
        e(24.5, 34, 3.4, 3.8, '#ffd166') + e(39.5, 34, 3.4, 3.8, '#ffd166') +
        e(24.5, 34, 1, 3, INK) + e(39.5, 34, 1, 3, INK) +
        e(28.5, 45, 1.4, 1, dark) + e(35.5, 45, 1.4, 1, dark) +
        s('M26 50 Q32 53 38 50', dark, 1.5);
    }],
    ['Astronaut', '#1d3557', function () {
      return c(10, 12, 1, '#fff') + c(54, 10, 1.2, '#fff') + c(57, 40, 0.9, '#fff') + c(7, 44, 1, '#fff') + c(48, 18, 0.7, '#fff') +
        e(32, 66, 20, 12, '#e9ecef') +
        r(10, 30, 4, 8, 2, '#adb5bd') + r(50, 30, 4, 8, 2, '#adb5bd') +
        c(32, 34, 20, '#f8f9fa') +
        r(16, 24, 32, 20, 10, '#14213d') +
        s('M21 30 Q22.5 27 26 26.5', '#8ecae6', 1.6) +
        c(26, 34, 2.4, '#fff') + c(38, 34, 2.4, '#fff') +
        s('M29 38.5 Q32 41 35 38.5', '#fff', 1.6);
    }],
    ['Cactus', '#f9c74f', function () {
      var green = '#52b788';
      return r(9, 24, 8, 18, 4, green) + r(9, 35, 14, 7, 3.5, green) +
        r(47, 20, 8, 16, 4, green) + r(41, 29, 14, 7, 3.5, green) +
        r(20, 14, 24, 40, 12, green) +
        s('M24 24 l-2 -1 M41 26 l2 -1 M24 46 l-2 1 M41 46 l2 1', '#2d6a4f', 1) +
        c(28.5, 13, 2.6, '#ff5d8f') + c(35.5, 13, 2.6, '#ff5d8f') + c(32, 9.5, 2.6, '#ff5d8f') + c(32, 13, 1.8, '#ffd166') +
        r(17, 49, 30, 6, 2, '#c8553d') + p('M19 55 H45 L42 66 H22 Z', '#e07a5f') +
        eyes(31, 5.5, 2.4) + cheeks(35, 9) +
        s('M29 36 Q32 39 35 36', INK, 1.5);
    }],
    ['Mushroom', '#b0f2b4', function () {
      return r(21, 34, 22, 32, 9, '#fff1d6') +
        p('M6 38 Q6 10 32 10 Q58 10 58 38 Q32 32 6 38 Z', '#e5383b') +
        c(20, 22, 4, '#fff') + c(38, 17, 3.2, '#fff') + c(47, 29, 3, '#fff') + c(29, 29, 2.5, '#fff') +
        eyes(45, 5, 2.5) + cheeks(49, 9) +
        s('M29.5 50 Q32 52.5 34.5 50', INK, 1.5);
    }],
    ['Star', '#5a189a', function () {
      var gold = '#ffd60a';
      return c(12, 14, 1.2, '#fff') + c(53, 53, 1, '#fff') + c(54, 12, 0.8, '#fff') +
        '<path d="' + starPath(32, 35, 23, 11, 5) + '" fill="' + gold + '" stroke="' + gold + '" stroke-width="4" stroke-linejoin="round"/>' +
        eyes(34, 6, 2.8) + cheeks(39.5, 10) +
        s('M28.5 40 Q32 43.5 35.5 40', INK, 1.8);
    }],
    ['Moon', '#0b2545', function () {
      var glow = '#fff3b0', crater = '#f1dd8a';
      return c(10, 14, 1.1, '#fff') + c(55, 12, 1.3, '#fff') + c(56, 50, 0.9, '#fff') + c(9, 50, 1, '#fff') +
        c(32, 34, 20, glow) +
        c(22, 25, 3, crater) + c(43, 44, 4, crater) + c(41, 22, 2, crater) +
        s('M22 34 Q25 37 28 34 M36 34 Q39 37 42 34', INK, 1.8) +
        cheeks(40, 12, '#ffb4a2') +
        s('M29.5 42 Q32 44 34.5 42', INK, 1.5);
    }],
    ['Cloud', '#48b8e4', function () {
      var puff = '#fff';
      return p('M20 55 Q22 59 20 61 Q18 59 20 55 Z M32 57 Q34 61 32 63 Q30 61 32 57 Z M44 55 Q46 59 44 61 Q42 59 44 55 Z', '#dff6ff') +
        c(21, 38, 11, puff) + c(32, 30, 13, puff) + c(43, 37, 11, puff) + r(12, 36, 40, 14, 7, puff) +
        eyes(38, 6, 2.6) + cheeks(42, 11) +
        s('M29 43 Q32 46 35 43', INK, 1.6);
    }],
    ['Sun', '#ff8fc0', function () {
      var out = '';
      for (var k = 0; k < 12; k++) {
        var a = k * Math.PI / 6, w = 0.16;
        out += p('M' + n(32 + 18 * Math.cos(a - w)) + ' ' + n(32 + 18 * Math.sin(a - w)) +
          ' L' + n(32 + 29 * Math.cos(a)) + ' ' + n(32 + 29 * Math.sin(a)) +
          ' L' + n(32 + 18 * Math.cos(a + w)) + ' ' + n(32 + 18 * Math.sin(a + w)) + ' Z', '#ffb703');
      }
      return out + c(32, 32, 17, '#ffd166') +
        r(19, 26, 11, 7, 3, INK) + r(34, 26, 11, 7, 3, INK) + s('M30 28.5 H34', INK, 1.8) +
        s('M21.5 28.5 L24 27.5 M36.5 28.5 L39 27.5', '#fff', 1) +
        cheeks(37, 11.5, '#ff7b54') +
        s('M26 38.5 Q32 44 38 38.5', INK, 1.8);
    }],
    ['Ninja', '#e9c46a', function () {
      var suit = '#22223b', band = '#d62828';
      return p('M47 25 L60 19 L57 26 Z', band) + p('M47 27 L59 31 L54 34 Z', band) +
        shoulders(suit) + c(32, 36, 19, suit) +
        r(15, 29, 34, 11, 5.5, '#f1c27d') +
        p('M14.5 27 Q32 19 49.5 27 L49 22.5 Q32 14.5 15 22.5 Z', band) +
        r(29, 19.5, 6, 4, 1, '#adb5bd') +
        eyes(34.5, 7, 2.6);
    }],
    ['Snowman', '#e76f51', function () {
      var snow = '#fff';
      return c(32, 70, 20, snow) +
        c(32, 36, 15, snow) +
        r(16, 48, 32, 6, 3, '#2a9d8f') + r(38, 50, 6, 12, 2, '#2a9d8f') +
        r(20, 20, 24, 4, 2, INK) + r(24, 6, 16, 16, 2, INK) + r(24, 16, 16, 3, 0, '#e63946') +
        eyes(34, 5.5, 2.4) + cheeks(40.5, 9) +
        p('M32 38 L43 40.5 L32 41.5 Z', '#fb8500') +
        c(27, 44.5, 1, INK) + c(30, 46, 1, INK) + c(34, 46, 1, INK) + c(37, 44.5, 1, INK);
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

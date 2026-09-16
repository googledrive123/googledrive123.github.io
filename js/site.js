/* GameVault shared chrome for every page that is not index.html.
   Paints the background layers, the header and the footer so a new page only
   has to supply its own <main class="page">. Pairs with /css/site.css. */
(function () {
  'use strict';

  var NAV = [
    { href: '/',           label: 'Games' },
    { href: '/schedule/',  label: 'Schedule' },
    { href: '/status/',    label: 'Requests' },
    { href: '/unblocker/', label: 'Browser' },
    { href: '/settings/',  label: 'Settings' }
  ];

  var LEGAL = [
    { href: '/legal/about/',                 label: 'About' },
    { href: '/legal/contact/',               label: 'Contact' },
    { href: '/legal/privacy-policy/',        label: 'Privacy' },
    { href: '/legal/terms-and-conditions/',  label: 'Terms' },
    { href: '/legal/cookies/',               label: 'Cookies' }
  ];

  function samePage(href) {
    var here = location.pathname.replace(/\/+$/, '') || '/';
    var there = href.replace(/\/+$/, '') || '/';
    return here === there;
  }

  function linkList(items) {
    return items.map(function (i) {
      var current = samePage(i.href) ? ' aria-current="page"' : '';
      return '<a href="' + i.href + '"' + current + '>' + i.label + '</a>';
    }).join('');
  }

  function backdrop() {
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="bg"></div>' +
      '<canvas id="particles" aria-hidden="true"></canvas>' +
      '<div class="orb" aria-hidden="true"></div>' +
      '<div class="scanlines" aria-hidden="true"></div>';
    while (wrap.firstChild) document.body.insertBefore(wrap.firstChild, document.body.firstChild);
  }

  function header() {
    var el = document.createElement('header');
    el.className = 'site-header';
    el.innerHTML =
      '<a class="site-brand" href="/"><span class="mark">GV</span>GameVault</a>' +
      '<nav class="site-nav" aria-label="Main">' + linkList(NAV) + '</nav>';
    document.body.insertBefore(el, document.body.querySelector('.page') || null);
  }

  function footer() {
    var el = document.createElement('footer');
    el.className = 'site-footer';
    el.innerHTML =
      '<nav aria-label="Legal">' + linkList(LEGAL) + '</nav>' +
      '<div class="fine">GameVault · ' + new Date().getFullYear() + '</div>';
    document.body.appendChild(el);
  }

  /* Drifting embers. Same look as the homepage canvas, minus the data streams —
     the inner pages are text, and a busier backdrop fights the reading. */
  function particles() {
    var canvas = document.getElementById('particles');
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var w = 0, h = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var parts = [];
    var COUNT = 35;
    var frame = 0;

    function rand(a, b) { return a + Math.random() * (b - a); }

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    for (var i = 0; i < COUNT; i++) {
      parts.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: rand(0.4, 1.6),
        vx: rand(-0.08, 0.08),
        vy: rand(-0.25, -0.05),
        a: rand(0.15, 0.55),
        pulse: rand(0, Math.PI * 2),
        ps: rand(0.005, 0.015),
        red: Math.random() < 0.15
      });
    }

    function tick() {
      frame = requestAnimationFrame(tick);
      ctx.clearRect(0, 0, w, h);
      for (var j = 0; j < parts.length; j++) {
        var p = parts[j];
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.ps;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        var alpha = p.a * (0.6 + 0.4 * Math.sin(p.pulse));
        ctx.fillStyle = p.red
          ? 'rgba(255, 59, 59, ' + alpha + ')'
          : 'rgba(255, 255, 255, ' + alpha + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // A background tab burning frames helps nobody.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; }
      else if (!document.hidden && !frame) tick();
    });

    resize();
    window.addEventListener('resize', resize);
    tick();
  }

  function build() {
    backdrop();
    header();
    footer();
    particles();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build, { once: true });
  } else {
    build();
  }
})();

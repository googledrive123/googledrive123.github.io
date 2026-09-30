/* GameVault apps menu: the 9-dot button in every header. Opens a small grid of
   everything the site has beyond the games. On a phone it slides in from the
   side as a drawer, which also holds the links the header has no room for.
   Used by index.html and, through site.js, every other page.
   Public surface: window.GV.apps.mount(container). */
(function () {
  'use strict';

  var APPS = [
    { href: '/games',      label: 'Games',    icon: '<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="15.5" cy="12" r="1"/><circle cx="17.5" cy="14" r="1"/>' },
    { href: '/movies',     label: 'Movies',   icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>' },
    { href: '/music/',     label: 'Music',    icon: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>' },
    { href: '/chat/',      label: 'Chat',     icon: '<path d="M4 5h16v10H9l-5 4z"/>' },
    { href: '/math/',      label: 'Math',     icon: '<path d="M5 7h6M8 4v6M14 7h5M5 17l5-5M5 12l5 5M14 15h5M14 19h5"/>' },
    { href: '/shop/',      label: 'Shop',     icon: '<path d="M4 8h16l-1.5 11h-13z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>' },
    { href: '/challenge/', label: 'Challenge', icon: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/>' },
    { href: '/giveaway/',  label: 'Giveaway', icon: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9zM12 9c2-4 6-4 6-1.5S14 9 12 9z"/>' },
    { href: '/saves/',     label: 'Saves',    icon: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>' },
    { href: '/schedule/',  label: 'Schedule', icon: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>' },
    { href: '/unblocker/', label: 'Browser',  icon: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16"/>' },
    { href: '/status/',    label: 'Requests', icon: '<path d="M5 5h14v14H5z"/><path d="M8 10l2 2 4-4M8 15h8"/>' },
    { href: '/settings/',  label: 'Settings', icon: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>' }
  ];

  var CSS =
    '.gv-apps{position:relative;flex-shrink:0}' +
    '.gv-apps-btn{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;transition:color .15s,border-color .15s}' +
    '.gv-apps-btn:hover,.gv-apps-btn[aria-expanded="true"]{color:var(--text);border-color:var(--border-strong)}' +
    '.gv-apps-panel{position:fixed;z-index:600;width:300px;padding:10px;border-radius:16px;background:var(--surface);border:1px solid var(--border-strong);box-shadow:0 20px 50px rgba(0,0,0,.55);display:grid;grid-template-columns:repeat(3,1fr);gap:4px}' +
    '.gv-apps-panel[hidden]{display:none}' +
    '.gv-app{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px;border-radius:12px;color:var(--muted);text-decoration:none;font-size:.74rem;transition:background .15s,color .15s}' +
    '.gv-app:hover,.gv-app[aria-current="page"]{background:var(--surface-2);color:var(--text)}' +
    '.gv-app svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
    '.gv-apps-scrim{display:none}' +
    '@media (max-width:700px){' +
      '.gv-apps-panel{top:0!important;right:0!important;bottom:0;width:min(78vw,300px);border-radius:0;grid-template-columns:repeat(2,1fr);align-content:start;padding:72px 12px 12px;transform:translateX(0);animation:gvAppsIn .22s ease}' +
      '.gv-apps-scrim{display:block;position:fixed;inset:0;z-index:599;background:rgba(0,0,0,.5)}' +
      '.gv-apps-scrim[hidden]{display:none}' +
    '}' +
    '@keyframes gvAppsIn{from{transform:translateX(100%)}}' +
    '@media (prefers-reduced-motion:reduce){.gv-apps-panel{animation:none}}';

  function style() {
    if (document.getElementById('gvAppsCss')) return;
    var st = document.createElement('style');
    st.id = 'gvAppsCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  var DOTS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    [5, 12, 19].map(function (y) { return [5, 12, 19].map(function (x) { return '<circle cx="' + x + '" cy="' + y + '" r="2"/>'; }).join(''); }).join('') +
    '</svg>';

  function here(href) {
    var p = location.pathname;
    return href === '/games' ? (p === '/' || p.indexOf('/games') === 0) : p.indexOf(href) === 0;
  }

  function mount(container) {
    if (!container || container.querySelector('.gv-apps')) return;
    style();
    var box = document.createElement('div');
    box.className = 'gv-apps';
    box.innerHTML =
      '<button class="gv-apps-btn" type="button" aria-label="Apps" aria-expanded="false">' + DOTS + '</button>' +
      '<div class="gv-apps-scrim" hidden></div>' +
      '<nav class="gv-apps-panel" aria-label="Apps" hidden>' + APPS.map(function (a) {
        return '<a class="gv-app" href="' + a.href + '"' + (here(a.href) ? ' aria-current="page"' : '') + '>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' + a.icon + '</svg>' + a.label + '</a>';
      }).join('') + '</nav>';
    container.appendChild(box);

    var btn = box.querySelector('.gv-apps-btn');
    var panel = box.querySelector('.gv-apps-panel');
    var scrim = box.querySelector('.gv-apps-scrim');
    // Headers use backdrop-filter, which makes a fixed child fixed to the
    // header instead of the screen. The panel lives on <body> and is placed
    // under its button each time it opens.
    document.body.append(scrim, panel);
    function set(open) {
      if (open) {
        var r = btn.getBoundingClientRect();
        panel.style.top = (r.bottom + 8) + 'px';
        panel.style.right = Math.max(8, innerWidth - r.right) + 'px';
      }
      panel.hidden = !open;
      scrim.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(panel.hidden); });
    scrim.addEventListener('click', function () { set(false); });
    document.addEventListener('click', function (e) { if (!box.contains(e.target) && !panel.contains(e.target)) set(false); });
    addEventListener('resize', function () { set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  }

  window.GV = window.GV || {};
  window.GV.apps = { mount: mount, list: APPS };
})();

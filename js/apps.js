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
    { href: '/saves/',     label: 'Saves',    icon: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>' },
    { href: '/schedule/',  label: 'Schedule', icon: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>' },
    { href: '/unblocker/', label: 'Browser',  icon: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16"/>' },
    { href: '/status/',    label: 'Requests', icon: '<path d="M5 5h14v14H5z"/><path d="M8 10l2 2 4-4M8 15h8"/>' },
    { href: '/settings/',  label: 'Settings', icon: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>' }
  ];
})();

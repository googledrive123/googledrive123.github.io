/**
 * URL cloaking — open GameVault inside a host tab so the address bar does not
 * read googledrive123.github.io.
 *
 * Two ways out, because one of them stopped working:
 *
 *   open()        Opens a blank popup and fills it with a full-page iframe.
 *                 Firefox and Safari keep `about:blank` in the address bar.
 *                 Chrome and Edge no longer do: once a script writes into an
 *                 about:blank popup, Chromium swaps the address bar over to
 *                 the opener's URL on purpose, to stop pages pretending their
 *                 content came from somewhere else. Nothing on our side can
 *                 undo that, so on Chromium the tab shows this site.
 *
 *   bookmarklet() The same popup, but launched from whatever page the user is
 *                 already on. Chromium still shows the opener's URL — and the
 *                 opener is now Classroom or Drive or wherever the bookmark
 *                 was clicked, so GameVault's address never appears at all.
 *
 * Public surface: window.GV.urlCloak.
 */
(function () {
  'use strict';

  var DEFAULT_TITLE = 'GameVault';
  var DEFAULT_ICON = '/favicon.svg';
  var FRAME_CSS = 'html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#08080a}'
    + 'iframe{display:block;width:100%;height:100%;border:0}';
  var FRAME_ALLOW = 'autoplay; fullscreen; gamepad; clipboard-write; cross-origin-isolated';

  function abs(url) {
    return url.indexOf('//') === 0 || url.indexOf('http') === 0
      ? url
      : location.origin + url;
  }

  /* Whatever disguise the tab cloak is already set to, reused so the popup
     matches the tab the user picked in settings. */
  function disguise() {
    var c = null;
    try { c = window.GV && window.GV.cloak && window.GV.cloak.current(); } catch (e) {}
    return {
      title: (c && c.title) || DEFAULT_TITLE,
      icon: abs((c && c.icon) || DEFAULT_ICON)
    };
  }

  /* Chromium is the family that rewrites the address bar. Everything else
     keeps about:blank, so the popup alone is enough there. */
  function isChromium() {
    var data = navigator.userAgentData;
    if (data && data.brands) {
      for (var i = 0; i < data.brands.length; i++) {
        if (/Chromium|Google Chrome|Microsoft Edge/i.test(data.brands[i].brand)) return true;
      }
      return false;
    }
    var ua = navigator.userAgent;
    return /Chrome|Chromium|Edg\//.test(ua) && !/Firefox|FxiOS/.test(ua);
  }

  /* DOM calls rather than document.write(): a fresh about:blank already has a
     head and a body, and writing into a document the browser is still
     committing is the part that flakes. */
  function fill(win, title, icon, src) {
    var d = win.document;
    d.title = title;

    var link = d.createElement('link');
    link.rel = 'icon';
    link.href = icon;
    d.head.appendChild(link);

    var style = d.createElement('style');
    style.textContent = FRAME_CSS;
    d.head.appendChild(style);

    var frame = d.createElement('iframe');
    frame.src = src;
    frame.allow = FRAME_ALLOW;
    frame.setAttribute('allowfullscreen', '');
    d.body.appendChild(frame);
  }

  /* Returns { ok, reason, hidesUrl }. hidesUrl is false on Chromium even when
     the popup opened fine, so callers can say so instead of claiming a cloak
     the address bar is about to contradict. */
  function open(src) {
    var target = abs(src || '/');
    var win = window.open();
    if (!win) return { ok: false, reason: 'popup-blocked', hidesUrl: false };

    var look = disguise();
    try {
      fill(win, look.title, look.icon, target);
    } catch (e) {
      win.location.href = target;
      return { ok: true, reason: 'write-blocked', hidesUrl: false };
    }
    return { ok: true, reason: null, hidesUrl: !isChromium() };
  }

  /* The same popup as a javascript: URL, for saving to the bookmarks bar. */
  function bookmarklet(src) {
    var look = disguise();
    var code = '(function(){'
      + 'var w=window.open();'
      + 'if(!w){alert("Allow pop-ups for this site, then click the bookmark again.");return}'
      + 'var d=w.document;'
      + 'd.title=' + JSON.stringify(look.title) + ';'
      + 'var l=d.createElement("link");l.rel="icon";l.href=' + JSON.stringify(look.icon) + ';d.head.appendChild(l);'
      + 'var s=d.createElement("style");s.textContent=' + JSON.stringify(FRAME_CSS) + ';d.head.appendChild(s);'
      + 'var f=d.createElement("iframe");f.src=' + JSON.stringify(abs(src || '/')) + ';'
      + 'f.allow=' + JSON.stringify(FRAME_ALLOW) + ';f.setAttribute("allowfullscreen","");'
      + 'd.body.appendChild(f)'
      + '})()';
    return 'javascript:' + encodeURIComponent(code);
  }

  window.GV = window.GV || {};
  window.GV.urlCloak = {
    open: open,
    bookmarklet: bookmarklet,
    isChromium: isChromium,
    disguise: disguise
  };
})();

/* For game copies in the vault sites. Some games build their file URLs while
   they run ("https://cdn.jsdelivr.net/gh/<repo>@main/" + name + ".part" + i),
   so no copy of their files can find every one ahead of time. A game page
   sets window.GV_CDN_MAP = { "<CDN prefix>": "<local folder>", ... } before
   loading this, and every URL the game asks for that starts with one of those
   prefixes is sent to the local copy instead. Covers fetch, XHR, and the src
   of scripts, images, audio and video. */
(function () {
  'use strict';
  var map = window.GV_CDN_MAP;
  if (!map) return;
  var prefixes = Object.keys(map).sort(function (a, b) { return b.length - a.length; });

  function local(url) {
    if (typeof url !== 'string') return url;
    for (var i = 0; i < prefixes.length; i++) {
      if (url.indexOf(prefixes[i]) === 0) return map[prefixes[i]] + url.slice(prefixes[i].length);
    }
    return url;
  }
  window.GV_CDN_LOCAL = local;

  var f = window.fetch;
  if (f) {
    window.fetch = function (input, init) {
      if (typeof input === 'string') input = local(input);
      else if (input && input.url && local(input.url) !== input.url) input = new Request(local(input.url), input);
      return f.call(this, input, init);
    };
  }

  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    args[1] = local(String(url));
    return open.apply(this, args);
  };

  [HTMLScriptElement, HTMLImageElement, HTMLAudioElement, HTMLVideoElement, HTMLSourceElement, HTMLLinkElement].forEach(function (C) {
    var prop = C === HTMLLinkElement ? 'href' : 'src';
    var d = Object.getOwnPropertyDescriptor(C.prototype, prop);
    if (!d || !d.set) return;
    Object.defineProperty(C.prototype, prop, {
      configurable: true,
      enumerable: d.enumerable,
      get: d.get,
      set: function (v) { d.set.call(this, local(String(v))); }
    });
  });

  var setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (name === 'src' || name === 'href') value = local(String(value));
    return setAttr.call(this, name, value);
  };
})();

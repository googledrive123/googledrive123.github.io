// Puts the player on the track a link sent them to, ready to drive.
(function () {
  'use strict';

  var KEY = 'gv.race';
  // Long enough to get through the bounce into the player and the game
  // loading, short enough that an old ask never takes over a later visit.
  var FRESH_MS = 2 * 60 * 1000;

  function take() {
    try {
      var ask = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      sessionStorage.removeItem(KEY);
      if (ask && /^[0-9a-f]{64}$/.test(ask.track) && Date.now() - ask.at < FRESH_MS) return ask.track;
    } catch (e) {}
    return null;
  }

  // The track's name and thumbnail, from the game's list of tracks, where
  // each one reads {id:"…",trackMetadata:{name:"…",…},…,thumbnail:"…"}.
  function lookUp(id) {
    return fetch('main.bundle.js', { cache: 'force-cache' })
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var at = text.indexOf('id:"' + id + '"');
        if (at < 0) return null;
        var end = text.indexOf('{id:"', at + 1);
        var entry = text.slice(at, end < 0 ? at + 1000 : end);
        var name = /trackMetadata:\{name:("(?:[^"\\]|\\.)*")/.exec(entry);
        var thumbnail = /thumbnail:"([^"]+)"/.exec(entry);
        if (!name || !thumbnail) return null;
        return { name: JSON.parse(name[1]), thumbnail: thumbnail[1] };
      });
  }
})();

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
})();

// Puts the player on the track a link sent them to, ready to drive.
(function () {
  'use strict';

  var KEY = 'gv.race';

  function take() {
    try {
      var ask = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (ask) return ask.track;
    } catch (e) {}
    return null;
  }
})();

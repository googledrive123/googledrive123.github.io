// A handle on PolyTrack's start-up physics check.
//
// As it starts, the game checks that its physics come out exactly as they do
// on every other computer, and it will not open or join a room until that
// check has finished and passed. Two things went wrong around it, and both
// read as "this browser cannot play multiplayer", which Firefox players were
// told more than anyone:
//
// - The menu can be up before the check is done. A room joined straight away,
//   as the dashboard's join does and a quick player can, went in while the
//   check was still running. The game treats "not finished" the same as
//   "failed" and the join died blaming the browser.
// - The check also hashes the track models. A stale copy of one in the
//   browser's cache fails it, and the game's only advice is to clear the
//   cache by hand.
//
// So this keeps the check's result where the rest of the site can see it,
// holds a join until the result is in, and when it is the models that
// failed, fetches fresh ones and starts the game again, once.
//
// Loaded before main.bundle.js. Must stay before it: the game sets the result
// up as it starts.
(function () {
  'use strict';

  // The game's own values for the check, in order.
  var STATES = ['pending', 'ok', 'failed', 'assets'];
  var WAIT_MS = 20000;

  var state = 'pending';
  var waiters = [];
  var values = new WeakMap();

  // The game keeps the result on its server client as determinismState, set
  // to pending as it starts and to the result once the check is done. The
  // assignment is caught on its way in, so the bundle stays untouched.
  Object.defineProperty(Object.prototype, 'determinismState', {
    configurable: true,
    get: function () { return values.get(this); },
    set: function (value) {
      values.set(this, value);
      state = STATES[value] || 'pending';
      if (state === 'pending') return;
      waiters.splice(0).forEach(function (fn) { fn(state); });
    }
  });

  // The result, once there is one. Anything still waiting after a while is
  // let go with whatever is known, so a newer game that keeps the result
  // somewhere else slows a join down rather than stopping it.
  function ready() {
    if (state !== 'pending') return Promise.resolve(state);
    return new Promise(function (resolve) {
      waiters.push(resolve);
      setTimeout(function () { resolve(state); }, WAIT_MS);
    });
  }

  window.GV = window.GV || {};
  window.GV.physics = {
    state: function () { return state; },
    ready: ready
  };
}());

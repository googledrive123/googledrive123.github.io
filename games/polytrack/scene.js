// A handle on PolyTrack's 3D scene, from outside the bundle.
//
// Room options like hiding or fading the other players' cars are changes to
// what gets drawn, and the game keeps its car objects to itself. Three.js,
// though, announces every Scene and renderer it builds to a global called
// __THREE_DEVTOOLS__ if one exists when it starts, which is how the browser
// extension of the same name works.
//
// Defining that global is enough to be handed the scene. Nothing here changes
// how the game behaves on its own; it only gives the room code something to
// reach for. If a future PolyTrack drops the hook, the options that depend on
// it stop working and nothing else does.
//
// Loaded before main.bundle.js in index.html. Must stay before it: the hook is
// only read while Three.js is initialising.
(function () {
  'use strict';

  var scene = null;
  var renderer = null;
  var waiting = [];

  function settle() {
    if (scene === null || renderer === null) return;
    var listeners = waiting;
    waiting = [];
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](scene, renderer); } catch (e) { console.error(e); }
    }
  }

  // The game builds more than one Scene over its lifetime. The one worth
  // holding is whichever is current, so a later one replaces an earlier.
  if (typeof window.__THREE_DEVTOOLS__ === 'undefined') {
    var hook = new EventTarget();
    hook.addEventListener('observe', function (event) {
      var thing = event.detail;
      if (!thing) return;
      if (thing.isScene === true) scene = thing;
      else if (thing.domElement && typeof thing.render === 'function') renderer = thing;
      settle();
    });
    window.__THREE_DEVTOOLS__ = hook;
  }

  window.GV = window.GV || {};
  window.GV.scene = {
    current: function () { return scene; },
    renderer: function () { return renderer; },
    // Resolves once both are known, and calls back again for nothing after.
    // Callers that need the live scene should read current() each time.
    ready: function (fn) {
      if (scene !== null && renderer !== null) fn(scene, renderer);
      else waiting.push(fn);
    }
  };
}());

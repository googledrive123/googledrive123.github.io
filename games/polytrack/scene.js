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
      else if (thing.domElement && typeof thing.render === 'function') {
        renderer = thing;
        watchRenderer(thing);
      }
      settle();
    });
    window.__THREE_DEVTOOLS__ = hook;
  }

  // ── Finding the cars ────────────────────────────────────────
  // A car is the only thing in the scene shaped like this: a group holding a
  // Body, a Suspension and four wheels. Nothing is named at the group level,
  // so the children are what identify it.

  function isCar(object) {
    if (object.type !== 'Group' || object.children.length < 2) return false;
    var names = 0;
    for (var i = 0; i < object.children.length; i++) {
      var name = object.children[i].name;
      if (name === 'Body' || name === 'Suspension' || name.indexOf('Wheel') === 0) names = names + 1;
    }
    return names >= 3;
  }

  function cars() {
    if (scene === null) return [];
    return scene.children.filter(isCar);
  }

  // The game builds a camera pair and then the car it belongs to, for every
  // participant, so the car being driven on this screen is the first one after
  // whichever camera is actually being rendered with. Which camera that is
  // only the renderer knows, so it is read as each frame goes out.
  var activeCamera = null;

  // The game writes to its cars' materials every frame, including a fade that
  // makes a car see-through when the camera is close to it. Anything applied
  // on a timer is overwritten before it is ever seen. Sitting on the render
  // call is the only place that reliably gets the last word.
  var beforeRender = [];

  // Stills of what is on screen. WebGL clears the canvas once a frame has been
  // shown, so reading it any other time gives back a blank image. Straight
  // after a render call, before control goes back to the browser, is the one
  // moment the picture is still there.
  var stills = [];

  function watchRenderer(target) {
    var render = target.render;
    if (typeof render !== 'function' || render.gvWrapped === true) return;
    var wrapped = function (renderScene, camera) {
      if (camera && camera.isCamera === true) activeCamera = camera;
      for (var i = 0; i < beforeRender.length; i++) {
        try { beforeRender[i](renderScene, camera); } catch (e) { console.error(e); }
      }
      var out = render.apply(this, arguments);
      // Passes into an offscreen target (shadows, reflections) are not the
      // picture on screen, so only a pass drawn to the canvas is kept.
      var toScreen = typeof target.getRenderTarget !== 'function' || target.getRenderTarget() === null;
      if (stills.length > 0 && toScreen) {
        var waiting = stills;
        stills = [];
        var picture = null;
        try { picture = target.domElement.toDataURL('image/jpeg', 0.9); } catch (e) { console.error(e); }
        for (var j = 0; j < waiting.length; j++) waiting[j](picture);
      }
      return out;
    };
    wrapped.gvWrapped = true;
    target.render = wrapped;
  }

  function localCar() {
    if (scene === null || activeCamera === null) return null;
    var children = scene.children;
    var from = children.indexOf(activeCamera);
    if (from < 0) return null;
    for (var i = from; i < children.length; i++) {
      if (isCar(children[i])) return children[i];
    }
    return null;
  }

  function otherCars() {
    var mine = localCar();
    return cars().filter(function (car) { return car !== mine; });
  }

  window.GV = window.GV || {};
  window.GV.scene = {
    current: function () { return scene; },
    renderer: function () { return renderer; },
    cars: cars,
    localCar: localCar,
    otherCars: otherCars,
    activeCamera: function () { return activeCamera; },
    onBeforeRender: function (fn) { beforeRender.push(fn); },
    // Resolves with a data URL of the next frame drawn, or null if the canvas
    // could not be read.
    still: function () {
      return new Promise(function (resolve) { stills.push(resolve); });
    },
    offBeforeRender: function (fn) {
      var at = beforeRender.indexOf(fn);
      if (at >= 0) beforeRender.splice(at, 1);
    },
    // Resolves once both are known, and calls back again for nothing after.
    // Callers that need the live scene should read current() each time.
    ready: function (fn) {
      if (scene !== null && renderer !== null) fn(scene, renderer);
      else waiting.push(fn);
    }
  };
}());

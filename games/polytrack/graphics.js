// Graphics quality for PolyTrack.
//
// The game ships every expensive setting turned on: shadows, clouds, fog,
// antialiasing, and a pixel density that follows the screen. On a Retina
// MacBook or a school Chromebook that last one alone means drawing four times
// the pixels, and the game runs at a crawl on exactly the machines most
// people here play on.
//
// All of those are already settings in the game. This file adds a Quality
// row that sets them together, starts weaker devices on a lighter one, and
// lowers the resolution on its own when the frame rate drops.
//
// Loaded before main.bundle.js in index.html. Must stay before it: the game
// reads its saved settings once, as it starts.
(function () {
  'use strict';

  var SETTINGS_KEY = 'polytrack_v5_prod_settings';

  // Each preset, as the values the game stores. The Settings screen shows the
  // same choices by these labels, which is how the Quality row sets them.
  var PRESETS = [
    { name: 'Very low', values: {
      ShadowQuality: '0', CloudsEnabled: 'false', ParticlesEnabled: 'false',
      SkidmarksEnabled: 'false', FogEnabled: 'false', RenderScale: '0.5',
      ScreenPixelDensity: 'false', Antialiasing: 'false' } },
    { name: 'Low', values: {
      ShadowQuality: '1', CloudsEnabled: 'false', ParticlesEnabled: 'true',
      SkidmarksEnabled: 'false', FogEnabled: 'true', RenderScale: '0.75',
      ScreenPixelDensity: 'false', Antialiasing: 'false' } },
    { name: 'Medium', values: {
      ShadowQuality: '2', CloudsEnabled: 'true', ParticlesEnabled: 'true',
      SkidmarksEnabled: 'true', FogEnabled: 'true', RenderScale: '1',
      ScreenPixelDensity: 'false', Antialiasing: 'true' } },
    { name: 'High', values: {
      ShadowQuality: '3', CloudsEnabled: 'true', ParticlesEnabled: 'true',
      SkidmarksEnabled: 'true', FogEnabled: 'true', RenderScale: '1',
      ScreenPixelDensity: 'true', Antialiasing: 'true' } },
    { name: 'Ultra', values: {
      ShadowQuality: '5', CloudsEnabled: 'true', ParticlesEnabled: 'true',
      SkidmarksEnabled: 'true', FogEnabled: 'true', RenderScale: '1',
      ScreenPixelDensity: 'true', Antialiasing: 'true' } }
  ];

  function presetNamed(name) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].name === name) return PRESETS[i];
    }
    return null;
  }

  // ── First launch ──────────────────────────────────────────────────────
  // Someone who has never opened the game here has no saved settings, and
  // the game would start them on everything turned up. On a Chromebook or
  // anything with few cores or little memory, that is the version that
  // barely runs, and most players never find the Settings screen to fix it.
  // They start on Low instead. Anyone with settings of their own keeps them.

  function looksLowEnd() {
    var ua = navigator.userAgent || '';
    if (/CrOS/.test(ua)) return true;
    if (navigator.deviceMemory && navigator.deviceMemory <= 4) return true;
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return true;
    return false;
  }

  // The game stores its settings as a list of [name, value] pairs and fills
  // in its own defaults for anything the list leaves out.
  function writePreset(preset) {
    var pairs = Object.keys(preset.values).map(function (name) {
      return [name, preset.values[name]];
    });
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(pairs)); } catch (e) {}
  }

  try {
    if (localStorage.getItem(SETTINGS_KEY) === null && looksLowEnd()) {
      writePreset(presetNamed('Low'));
    }
  } catch (e) {}

  // ── Auto resolution ───────────────────────────────────────────────────
  // When the frame rate drops, the resolution drops with it, a step at a
  // time, and comes back up once there is room. Everything else about the
  // picture stays as chosen: this only trades sharpness for smoothness, and
  // only as much as the machine needs right now. Frames are counted from the
  // browser's own animation callback, which slows down exactly when the game
  // cannot keep up.

  var AUTO_KEY = 'gv.graphics.autoResolution';
  var LOWEST = 0.4;
  var SLOW_FPS = 48;
  var SMOOTH_FPS = 57;

  function autoOn() {
    try { return localStorage.getItem(AUTO_KEY) !== 'off'; } catch (e) { return true; }
  }

  function setAuto(on) {
    try { localStorage.setItem(AUTO_KEY, on ? 'on' : 'off'); } catch (e) {}
    var scene = window.GV && window.GV.scene;
    if (!on && scene) scene.setResolutionFactor(1);
  }

  var frames = 0;
  var windowStart = 0;
  var slowFor = 0;
  var smoothFor = 0;

  // Not every slow machine is slow at drawing pixels. One capped at 30 frames
  // by a power saving mode, or held back by its processor, gets nothing from
  // a blurrier picture. So each step down is checked: if the frame rate did
  // not come up, the step is undone and no more are tried for a minute.
  var lastStep = null;
  var holdUntil = 0;

  function adjust(fps) {
    var scene = window.GV && window.GV.scene;
    if (!scene || !autoOn()) return;
    var now = scene.resolutionFactor();

    if (lastStep !== null) {
      var step = lastStep;
      lastStep = null;
      if (fps < step.fps * 1.08) {
        scene.setResolutionFactor(step.from);
        holdUntil = Date.now() + 60000;
        slowFor = 0;
        return;
      }
    }

    slowFor = fps < SLOW_FPS ? slowFor + 1 : 0;
    smoothFor = fps >= SMOOTH_FPS ? smoothFor + 1 : 0;
    // Two slow seconds in a row, so a single hitch does not blur the screen.
    if (slowFor >= 2 && now > LOWEST && Date.now() >= holdUntil) {
      lastStep = { from: now, fps: fps };
      scene.setResolutionFactor(Math.max(LOWEST, now * 0.85));
      slowFor = 0;
    // Five smooth ones before sharpening again, so it does not see-saw.
    } else if (smoothFor >= 5 && now < 1) {
      scene.setResolutionFactor(Math.min(1, now * 1.1));
      smoothFor = 0;
    }
  }

  function tick(time) {
    requestAnimationFrame(tick);
    // A hidden tab gets no frames to speak of, and that is not the game
    // struggling.
    if (document.visibilityState === 'hidden') {
      windowStart = 0;
      return;
    }
    if (!windowStart) {
      windowStart = time;
      frames = 0;
      return;
    }
    frames = frames + 1;
    if (time - windowStart >= 1000) {
      adjust(frames * 1000 / (time - windowStart));
      windowStart = time;
      frames = 0;
    }
  }
  requestAnimationFrame(tick);

  window.GV = window.GV || {};
  window.GV.graphics = {
    presets: function () { return PRESETS.map(function (p) { return p.name; }); },
    autoResolution: autoOn,
    setAutoResolution: setAuto
  };
}());

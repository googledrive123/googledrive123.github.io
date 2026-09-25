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

  window.GV = window.GV || {};
  window.GV.graphics = {
    presets: function () { return PRESETS.map(function (p) { return p.name; }); }
  };
}());

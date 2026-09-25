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
      ShadowQuality: '1', CloudsEnabled: 'true', ParticlesEnabled: 'true',
      SkidmarksEnabled: 'true', FogEnabled: 'true', RenderScale: '1',
      ScreenPixelDensity: 'false', Antialiasing: 'true' } },
    // Exactly what the game starts on by itself.
    { name: 'High', values: {
      ShadowQuality: '2', CloudsEnabled: 'true', ParticlesEnabled: 'true',
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

  // ── The Settings screen ───────────────────────────────────────────────
  // Rows at the top of the game's own Graphics section, built the way the
  // game builds its rows so they look like part of it. Quality works by
  // pressing the game's own buttons further down, so each setting changes
  // exactly as if the player had pressed it, and the game's Apply saves it.

  // The game's row for each stored setting, and its button for each value.
  var ROWS = {
    ShadowQuality: { label: 'Shadows', choices: { '0': 'Off', '1': 'Minimal', '2': 'Low', '3': 'Medium', '4': 'High', '5': 'Ultra' } },
    CloudsEnabled: { label: 'Clouds', choices: { 'false': 'Off', 'true': 'On' } },
    ParticlesEnabled: { label: 'Particles', choices: { 'false': 'Off', 'true': 'On' } },
    SkidmarksEnabled: { label: 'Skidmarks', choices: { 'false': 'Off', 'true': 'On' } },
    FogEnabled: { label: 'Fog', choices: { 'false': 'Off', 'true': 'On' } },
    RenderScale: { label: 'Render scale', choices: { '0.5': '50%', '0.75': '75%', '1': '100%' } },
    ScreenPixelDensity: { label: 'Screen Pixel Density', choices: { 'false': 'Fixed', 'true': 'Auto' } },
    Antialiasing: { label: 'Anti-aliasing (requires restart)', choices: { 'false': 'Off', 'true': 'On' } }
  };

  function gameButton(menu, name, value) {
    var row = ROWS[name];
    var settings = menu.querySelectorAll('.setting');
    for (var i = 0; i < settings.length; i++) {
      var label = settings[i].querySelector(':scope > p');
      if (!label || label.textContent !== row.label) continue;
      var buttons = settings[i].querySelectorAll('.button-wrapper > button');
      for (var j = 0; j < buttons.length; j++) {
        if (buttons[j].textContent === row.choices[value]) return buttons[j];
      }
    }
    return null;
  }

  function applyPreset(menu, preset) {
    Object.keys(preset.values).forEach(function (name) {
      var button = gameButton(menu, name, preset.values[name]);
      if (button && !button.classList.contains('selected')) button.click();
    });
  }

  // Whichever preset the rows below currently add up to, if any.
  function matchingPreset(menu) {
    for (var i = 0; i < PRESETS.length; i++) {
      var values = PRESETS[i].values;
      var all = Object.keys(values).every(function (name) {
        var button = gameButton(menu, name, values[name]);
        return button && button.classList.contains('selected');
      });
      if (all) return PRESETS[i].name;
    }
    return null;
  }

  function choiceRow(className, label, options, selected, onPick) {
    var row = document.createElement('div');
    row.className = 'setting ' + className;
    var text = document.createElement('p');
    text.textContent = label;
    row.appendChild(text);
    var wrapper = document.createElement('div');
    wrapper.className = 'button-wrapper';
    row.appendChild(wrapper);
    options.forEach(function (option) {
      var button = document.createElement('button');
      button.className = option === selected ? 'button selected' : 'button';
      button.textContent = option;
      button.addEventListener('click', function () { onPick(option); });
      wrapper.appendChild(button);
    });
    return row;
  }

  function markSelected(row, selected) {
    var buttons = row.querySelectorAll('.button-wrapper > button');
    for (var i = 0; i < buttons.length; i++) {
      var want = buttons[i].textContent === selected ? 'button selected' : 'button';
      if (buttons[i].className !== want) buttons[i].className = want;
    }
  }

  function fillSettings() {
    var menu = document.querySelector('.settings-menu-ui');
    if (!menu || menu.querySelector('.gv-quality')) return;
    var headings = menu.querySelectorAll('h2');
    var heading = null;
    for (var i = 0; i < headings.length; i++) {
      if (headings[i].textContent === 'Graphics') heading = headings[i];
    }
    if (!heading) return;

    var quality = choiceRow('gv-quality', 'Quality', PRESETS.map(function (p) { return p.name; }),
      matchingPreset(menu), function (name) {
        applyPreset(menu, presetNamed(name));
        markSelected(quality, matchingPreset(menu));
      });
    var auto = choiceRow('gv-auto-resolution', 'Auto resolution', ['Off', 'On'],
      autoOn() ? 'On' : 'Off', function (choice) {
        setAuto(choice === 'On');
        markSelected(auto, choice);
      });

    heading.parentNode.insertBefore(auto, heading.nextSibling);
    heading.parentNode.insertBefore(quality, heading.nextSibling);

    // Changing any single row can make the rows add up to a different preset,
    // or to none of them.
    menu.addEventListener('click', function () {
      setTimeout(function () { markSelected(quality, matchingPreset(menu)); }, 0);
    });
  }

  function watchSettings() {
    new MutationObserver(fillSettings).observe(document.body, { childList: true, subtree: true });
    fillSettings();
  }

  if (document.body) watchSettings();
  else document.addEventListener('DOMContentLoaded', watchSettings);

  window.GV = window.GV || {};
  window.GV.graphics = {
    presets: function () { return PRESETS.map(function (p) { return p.name; }); },
    autoResolution: autoOn,
    setAutoResolution: setAuto
  };
}());

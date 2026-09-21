// The GameVault room lobby inside PolyTrack.
//
// rooms.js makes the game's own multiplayer work again. This file is the part
// players see: the menu tile that leads to it, and the lobby that replaces the
// game's own host and join panels.
//
// The stock panels host one track for one race and stop there. A room here
// keeps a playlist, carries standings between rounds, and lets each player
// decide how the others appear on their own screen.
//
// Like leaderboard.js and account.js, this stays outside main.bundle.js: it
// waits for the game to build a screen and then changes it, so the bundle is
// still exactly what Kodub shipped and a newer PolyTrack drops straight in.
(function () {
  'use strict';

  // ── The menu tile ─────────────────────────────────────────────────────
  // The game already builds a Multiplayer tile and it already opens the right
  // screen, so there is nothing to add to the menu, only a word to change. The
  // tiles carry no id, and the label is the only thing that tells them apart.

  var TILE_LABEL = 'Rooms';
  var STOCK_LABEL = 'Multiplayer';

  function renameTile(menu) {
    var labels = menu.querySelectorAll(':scope > .main-buttons-container .button-image > p');
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].textContent === STOCK_LABEL) labels[i].textContent = TILE_LABEL;
    }
  }

  // ── Room settings ────────────────────────────────────────────
  // What the host picks before opening a room. Kept here and remembered
  // between sessions, because a host who wants ghosts off wants them off every
  // time and re-picking on every room is a chore.

  var STORE_KEY = 'gv.rooms.settings';

  var DEFAULTS = {
    otherCars: 'translucent'
  };

  // What the host has chosen, kept between sessions. In a room this is only
  // the host's copy: everyone else races under whatever the host sends, held
  // in active, and gets their own preferences back when they leave.
  var settings = read();
  var active = null;
  var playerPicked = false;

  function effective() {
    return active === null ? settings : active;
  }

  function copyOf(source) {
    var out = {};
    Object.keys(source).forEach(function (key) { out[key] = source[key]; });
    return out;
  }

  function read() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    var out = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      out[key] = saved[key] === undefined ? DEFAULTS[key] : saved[key];
    });
    return out;
  }

  function write() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* private mode */ }
  }

  // ── Host panel ────────────────────────────────────────────────
  // The game's own host panel is a stack of blocks: a title, a row of buttons,
  // a line of explanation. Ours reuse .game-mode-container and .button, so
  // they are not styled to look like the game's, they are the game's.

  var OTHER_CARS = [
    { value: 'solid', label: 'Solid', info: 'Other players appear as normal cars.' },
    { value: 'translucent', label: 'Translucent', info: 'Other players are see-through, so the track stays readable.' },
    { value: 'hidden', label: 'Hidden', info: 'Race alone against their times.' }
  ];

  function choiceBlock(title, options, current, onPick) {
    var block = document.createElement('div');
    block.className = 'game-mode-container gv-room-option';

    var heading = document.createElement('div');
    heading.className = 'title';
    heading.textContent = title;
    block.appendChild(heading);

    var info = document.createElement('div');
    info.className = 'info';

    var buttons = [];
    options.forEach(function (option) {
      var button = document.createElement('button');
      button.className = option.value === current ? 'button selected' : 'button';
      button.textContent = option.label;
      button.addEventListener('click', function () {
        for (var i = 0; i < buttons.length; i++) buttons[i].classList.remove('selected');
        button.classList.add('selected');
        info.textContent = option.info;
        onPick(option.value);
      });
      buttons.push(button);
      block.appendChild(button);
    });

    var chosen = options.filter(function (option) { return option.value === current; })[0] || options[0];
    info.textContent = chosen.info;
    block.appendChild(info);
    return block;
  }

  // Cars cannot touch each other: the physics runs on each player's own
  // machine and everyone else arrives as a position to draw, so there is
  // nothing to collide with. What the host can decide is how present the
  // others look, which is what this actually controls.
  function otherCarsBlock() {
    return choiceBlock('Other Cars', OTHER_CARS, settings.otherCars, function (value) {
      settings.otherCars = value;
      write();
      applyNow();
      tellRoom();
    });
  }

  // The same control on the join side, under the code box. A player decides
  // how the others look on their own screen, so this wins over whatever the
  // host sent: the host's choice is where everyone starts, not a rule.
  //
  // It stays out of the way until there is a code to join, because until then
  // there is no room for it to be about.
  function joinChoiceBlock() {
    var block = choiceBlock('Other Cars', OTHER_CARS, effective().otherCars, function (value) {
      settings.otherCars = value;
      playerPicked = true;
      write();
      if (active !== null) active.otherCars = value;
      applyNow();
    });
    block.classList.add('gv-join-option');
    return block;
  }

  function fillJoinPanel(root) {
    var box = root.querySelector(':scope > .join > .main-box');
    if (!box) return;

    var block = box.querySelector('.gv-join-option');
    if (!block) {
      block = joinChoiceBlock();
      var after = box.querySelector(':scope > .invite-code-container');
      if (!after) return;
      box.insertBefore(block, after.nextSibling);

      var code = box.querySelector('.invite-code');
      if (code) code.addEventListener('input', function () { showJoinOption(box); });
    }
    showJoinOption(box);
  }

  function showJoinOption(box) {
    var block = box.querySelector('.gv-join-option');
    var code = box.querySelector('.invite-code');
    if (!block || !code) return;
    block.style.display = code.value.trim().length > 0 ? '' : 'none';
  }

  function fillHostPanel(root) {
    var box = root.querySelector(':scope > .host > .main-box');
    if (!box || box.querySelector('.gv-room-option')) return;
    var buttons = box.querySelector(':scope > .buttons');
    if (!buttons) return;
    box.insertBefore(otherCarsBlock(), buttons);
  }

  // ── Applying it on screen ───────────────────────────────────
  // The game rebuilds cars as players join, leave and reset, and it has no
  // idea anyone else has an opinion about them, so the setting is reapplied on
  // a timer rather than set once. The work is a handful of property writes
  // over at most a few cars, far below anything that would show up in a frame.
  //
  // Materials are cloned the first time a car is touched. PolyTrack shares
  // them between cars, so fading one without a clone would fade the one being
  // driven along with it.

  var TRANSLUCENT = 0.35;
  var applying = false;

  function meshes(root, fn) {
    root.traverse(function (object) { if (object.isMesh === true) fn(object); });
  }

  function ownMaterials(mesh) {
    if (mesh.userData.gvOwnMaterial !== true) {
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(function (material) { return material.clone(); })
        : mesh.material.clone();
      mesh.userData.gvOwnMaterial = true;
    }
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  }

  function paint(car, mode) {
    car.visible = mode !== 'hidden';
    if (mode === 'hidden') return;

    var opacity = mode === 'translucent' ? TRANSLUCENT : 1;
    meshes(car, function (mesh) {
      // A car left alone has never been cloned, and solid is what it already
      // is, so there is nothing to do and no clone worth making.
      if (opacity === 1 && mesh.userData.gvOwnMaterial !== true) return;
      ownMaterials(mesh).forEach(function (material) {
        if (material.opacity === opacity && material.transparent === (opacity < 1)) return;
        material.transparent = opacity < 1;
        material.opacity = opacity;
        // Depth writing stays on. Turning it off is the usual way to make
        // transparency look right against a scene, but a car is a solid object
        // with parts inside it, and without depth the wheels and the seat show
        // straight through the bodywork.
        material.depthWrite = true;
      });
    });
  }

  function applyNow(mode) {
    var scene = window.GV && window.GV.scene;
    if (!scene || scene.current() === null) return;
    var others = scene.otherCars();
    var chosen = mode || effective().otherCars;
    for (var i = 0; i < others.length; i++) paint(others[i], chosen);
  }

  function eachFrame() {
    applyNow();
  }

  function startApplying() {
    var scene = window.GV && window.GV.scene;
    if (applying || !scene) return;
    applying = true;
    scene.onBeforeRender(eachFrame);
  }

  // Leaving a room puts the cars back the way the game had them. The setting
  // itself is untouched: it is the host's choice for next time, not a
  // description of what is currently on screen.
  function stopApplying() {
    var scene = window.GV && window.GV.scene;
    if (!applying || !scene) return;
    applying = false;
    scene.offBeforeRender(eachFrame);
    applyNow('solid');
  }

  // ── Keeping the room in step ────────────────────────────────
  // The host's choices are the room's, so they are sent to everyone in it.
  // They go out on a repeat rather than once, because a player who joins
  // midway through has no way to ask for what they missed, and the payload is
  // a few dozen bytes.

  var TELL_EVERY = 3000;
  var telling = null;

  function tellRoom() {
    var rooms = window.GV && window.GV.rooms;
    if (!rooms) return;
    rooms.say({ kind: 'settings', settings: settings });
  }

  function startTelling() {
    if (telling !== null) return;
    tellRoom();
    telling = setInterval(tellRoom, TELL_EVERY);
  }

  function stopTelling() {
    if (telling === null) return;
    clearInterval(telling);
    telling = null;
  }

  function heardSettings(payload) {
    if (!payload || payload.kind !== 'settings' || !payload.settings) return;
    var rooms = window.GV && window.GV.rooms;
    // The host is the one sending these, and its own copy is the original.
    if (!rooms || rooms.state().role !== 'player') return;

    // A player who has picked for themselves keeps their pick.
    if (playerPicked) return;

    var next = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      next[key] = payload.settings[key] === undefined ? DEFAULTS[key] : payload.settings[key];
    });
    active = next;
  }

  // ── Wiring ────────────────────────────────────────────────────────────
  // The menu is rebuilt from scratch every time the game returns to it, so the
  // rename is reapplied rather than assumed to have survived. Class changes
  // matter as much as new nodes: the game moves between screens by toggling
  // "hidden", which is an attribute change and nothing else.

  function attach() {
    var menu = document.querySelector('.menu-ui');
    if (menu) renameTile(menu);

    var rooms = document.querySelector('.multiplayer-ui');
    if (rooms) {
      fillHostPanel(rooms);
      fillJoinPanel(rooms);
    }
  }

  function start() {
    var rooms = window.GV && window.GV.rooms;
    if (rooms) {
      rooms.onMessage(heardSettings);
      rooms.onState(function (state) {
        if (state.code === null) {
          stopTelling();
          stopApplying();
          active = null;
          // The next room starts by following its own host again.
          playerPicked = false;
          return;
        }
        // A player races under the host's choices, not their own saved ones,
        // so until the first broadcast lands they sit on the defaults rather
        // than briefly applying what they last chose as a host themselves.
        // Unless they already picked on the join screen, which stands.
        if (state.role === 'host') active = settings;
        else active = copyOf(playerPicked ? settings : DEFAULTS);
        startApplying();
        if (state.role === 'host') startTelling();
      });
    }

    new MutationObserver(attach).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class']
    });
    attach();
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}());

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
    otherCars: 'solid'
  };

  var settings = read();

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
    });
  }

  function fillHostPanel(root) {
    var box = root.querySelector(':scope > .host > .main-box');
    if (!box || box.querySelector('.gv-room-option')) return;
    var buttons = box.querySelector(':scope > .buttons');
    if (!buttons) return;
    box.insertBefore(otherCarsBlock(), buttons);
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
    if (rooms) fillHostPanel(rooms);
  }

  function start() {
    new MutationObserver(attach).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class']
    });
    attach();
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}());

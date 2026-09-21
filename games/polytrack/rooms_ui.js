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

  // ── Wiring ────────────────────────────────────────────────────────────
  // The menu is rebuilt from scratch every time the game returns to it, so the
  // rename is reapplied rather than assumed to have survived. Class changes
  // matter as much as new nodes: the game moves between screens by toggling
  // "hidden", which is an attribute change and nothing else.

  function attach() {
    var menu = document.querySelector('.menu-ui');
    if (menu) renameTile(menu);
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

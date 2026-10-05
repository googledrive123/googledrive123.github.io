// Puts the player on the track a link sent them to, ready to drive.
//
// The weekly challenge's Race it button, and Race now on the home page's
// card, leave the week's track id in sessionStorage under gv.race on their
// way here. Without this the game opens on its menu, and the player still
// has to find the track themselves.
(function () {
  'use strict';

  var KEY = 'gv.race';
  // Long enough to get through the bounce into the player and the game
  // loading, short enough that an old ask never takes over a later visit.
  var FRESH_MS = 2 * 60 * 1000;
  // The game itself can take a while to load on a school laptop.
  var GIVE_UP_MS = 60 * 1000;
  var POLL_MS = 250;
  // Each screen animates in, and a click before it has settled can be lost.
  var SETTLE_MS = 700;

  function shown(el) {
    return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0;
  }

  // The game keeps some screens in the document while they are put away,
  // and two track pickers, one for Play and one for hosting a room.
  function onScreen(selector) {
    var all = document.querySelectorAll(selector);
    for (var i = 0; i < all.length; i++) if (shown(all[i])) return all[i];
    return null;
  }

  // The game's menus, or a race, are up. Read no earlier: a page opened on
  // its own is sent into the player by /js/mimicry.js, and that page must
  // leave the ask for the one inside the player.
  function gameUp() {
    return !!document.querySelector('#ui > .menu-ui, #ui > .game-ui');
  }

  function take() {
    try {
      var ask = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      sessionStorage.removeItem(KEY);
      if (ask && /^[0-9a-f]{64}$/.test(ask.track) && Date.now() - ask.at < FRESH_MS) return ask.track;
    } catch (e) {}
    return null;
  }

  // The track's name and thumbnail, from the game's list of tracks, where
  // each one reads {id:"…",trackMetadata:{name:"…",…},…,thumbnail:"…"}.
  function lookUp(id) {
    return fetch('main.bundle.js', { cache: 'force-cache' })
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var at = text.indexOf('id:"' + id + '"');
        if (at < 0) return null;
        var end = text.indexOf('{id:"', at + 1);
        var entry = text.slice(at, end < 0 ? at + 1000 : end);
        var name = /trackMetadata:\{name:("(?:[^"\\]|\\.)*")/.exec(entry);
        var thumbnail = /thumbnail:"([^"]+)"/.exec(entry);
        if (!name || !thumbnail) return null;
        return { name: JSON.parse(name[1]), thumbnail: thumbnail[1] };
      });
  }

  function buttonWithIcon(root, icon) {
    var image = root && root.querySelector('img[src="images/' + icon + '"]');
    return image ? image.closest('button') : null;
  }

  // One look at the screen, and one click towards the track: 'done' once
  // the player is on it, 'clicked' when the screen should be about to change,
  // and 'wait' while the game is busy.
  function step(track) {
    var page = onScreen('.track-info-ui');
    if (page) {
      var picked = page.querySelector('.side-panel .thumbnail img');
      var button = picked && picked.getAttribute('src') === track.thumbnail
        ? page.querySelector('button.play')
        : page.querySelector('button.back');
      if (!button) return 'wait';
      button.click();
      return button.classList.contains('play') ? 'done' : 'clicked';
    }

    var picker = onScreen('.track-selection-ui');
    if (picker) {
      // Every tab's cards are built up front, so a card behind another tab
      // opens just the same.
      var image = picker.querySelector('.track .thumbnail[src="' + track.thumbnail + '"]');
      if (!image) return 'wait';
      image.closest('.track').querySelector('button').click();
      return 'clicked';
    }

    var toolbar = onScreen('.game-toolbar-ui.visible');
    if (toolbar) {
      var on = toolbar.querySelector('.track-name');
      if (on && on.textContent.trim() === track.name) return 'done';
      var exit = buttonWithIcon(toolbar, 'quit.svg');
      if (!exit) return 'wait';
      exit.click();
      return 'clicked';
    }

    var play = buttonWithIcon(onScreen('.main-buttons-container'), 'play.svg');
    if (!play) return 'wait';
    play.click();
    return 'clicked';
  }

  // Keys pressed now should drive the car, not stay with the page around
  // the game, which still has them from the click that led here.
  function focusGame() {
    try { window.focus(); } catch (e) {}
  }

  function drive(track) {
    var until = Date.now() + GIVE_UP_MS;
    (function next() {
      if (Date.now() > until) return;
      var result = 'wait';
      try { result = step(track); } catch (e) { console.error('[race]', e); }
      if (result === 'done') {
        focusGame();
        return;
      }
      setTimeout(next, result === 'clicked' ? SETTLE_MS : POLL_MS);
    })();
  }

  var waited = 0;
  var wait = setInterval(function () {
    waited += POLL_MS;
    if (waited > GIVE_UP_MS) clearInterval(wait);
    if (!gameUp()) return;
    clearInterval(wait);
    var id = take();
    if (!id) return;
    lookUp(id).then(function (track) {
      if (track) drive(track);
    }).catch(function (err) { console.error('[race]', err); });
  }, POLL_MS);
})();

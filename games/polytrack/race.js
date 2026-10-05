// Puts the player on the track a link sent them to, ready to drive.
(function () {
  'use strict';

  var KEY = 'gv.race';
  // Long enough to get through the bounce into the player and the game
  // loading, short enough that an old ask never takes over a later visit.
  var FRESH_MS = 2 * 60 * 1000;
  var POLL_MS = 250;
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

  function drive(track) {
    (function next() {
      var result = 'wait';
      try { result = step(track); } catch (e) { console.error('[race]', e); }
      if (result === 'done') return;
      setTimeout(next, result === 'clicked' ? SETTLE_MS : POLL_MS);
    })();
  }
})();

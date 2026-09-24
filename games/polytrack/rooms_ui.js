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
    otherCars: 'translucent',
    playlist: [],
    roundSeconds: 0,
    visibility: 'private'
  };

  // What the host has chosen, kept between sessions. In a room this is only
  // the host's copy: everyone else races under whatever the host sends, held
  // in active, and gets their own preferences back when they leave.
  var settings = read();
  var active = null;
  var playerPicked = false;

  // The last thing the host said, kept so that a broadcast arriving before
  // this page knows it is in a room is not simply lost.
  var heard = null;

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

  var ROUND_LENGTHS = [
    { value: 0, label: 'Manual', info: 'The room stays on a track until the host moves it on.' },
    { value: 120, label: '2 min', info: 'Each track runs for two minutes, then the room moves on.' },
    { value: 180, label: '3 min', info: 'Each track runs for three minutes, then the room moves on.' },
    { value: 300, label: '5 min', info: 'Each track runs for five minutes, then the room moves on.' }
  ];

  var VISIBILITY = [
    { value: 'private', label: 'Private', info: 'Players join with the room code.' },
    { value: 'public', label: 'Public', info: 'Listed under Public Rooms, where anyone can join without a code.' }
  ];

  var OTHER_CARS = [
    { value: 'solid', label: 'Solid', info: 'Other players appear as normal cars.' },
    { value: 'translucent', label: 'Translucent', info: 'Other players are see-through, so the track stays readable.' },
    { value: 'hidden', label: 'Hidden', info: 'Race alone against their times.' }
  ];

  // The game styles these blocks by their full path, .multiplayer-ui > .host >
  // .main-box > .game-mode-container > .title and so on, so an identical block
  // on the join side matches none of it and comes out as unstyled black text.
  // These are the same declarations, keyed off our own class instead, so one
  // block looks right wherever it is put.
  var STYLE_ID = 'gv-rooms-style';

  var STYLE = [
    // Tighter than the game's own blocks. Three of these are being added to a
    // panel built for none, and every pixel saved is a pixel nobody has to
    // scroll past to reach the Host button.
    '.gv-room-option {',
    '  margin: 8px 10px;',
    '  padding: 14px;',
    '  box-sizing: border-box;',
    '  width: calc(100% - 10px * 2);',
    '  background-color: var(--surface-color);',
    '}',
    '.gv-room-option > .title {',
    '  margin: 0 0 6px 0;',
    '  padding: 0;',
    '  font-size: 26px;',
    '  color: var(--text-color);',
    '}',
    '.gv-room-option > .button:first-of-type {',
    '  margin: 0 0 0 -5px;',
    '}',
    '.gv-room-option > .button.selected {',
    '  background-color: var(--button-hover-color);',
    '}',
    '.gv-room-option > .info {',
    '  margin: 8px 0 0 0;',
    '  padding: 0;',
    '  font-size: 18px;',
    '  color: var(--text-color);',
    '}',
    // The list scrolls inside its own block rather than stretching the panel.
    // A ten track circuit should not push everything else off the screen.
    '.gv-track-list > .rows {',
    '  max-height: 184px;',
    '  overflow-y: auto;',
    '  overscroll-behavior: contain;',
    '}',
    '.gv-track-row {',
    '  display: flex;',
    '  align-items: center;',
    '  margin: 0 0 4px 0;',
    '  background-color: var(--button-color);',
    '  clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);',
    '}',
    '.gv-track-row > .position {',
    '  padding: 0 10px;',
    '  font-size: 20px;',
    '  color: var(--text-color);',
    '  opacity: 0.6;',
    '}',
    '.gv-track-row > .thumbnail {',
    '  width: 38px;',
    '  height: 38px;',
    '  image-rendering: pixelated;',
    '}',
    '.gv-track-row > .name {',
    '  flex: 1;',
    '  padding: 0 10px;',
    '  font-size: 20px;',
    '  color: var(--text-color);',
    '  white-space: nowrap;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '}',
    '.gv-track-row > .remove {',
    '  margin: 0;',
    '  padding: 2px 12px;',
    '  font-size: 20px;',
    '}',
    // The stock panel was built for three short blocks and is absolutely
    // positioned, so it just grows off the bottom of the screen. With a track
    // list on it the Back and Host buttons ended up past the viewport, which
    // means a host who cannot start their own room.
    //
    // The box is capped to the window and scrolls, and the buttons are stuck
    // to its bottom edge so they stay reachable. The heading stays put too, so
    // it is always clear which panel is being scrolled.
    //
    // Keyed off #ui rather than a class of our own. An id outranks the
    // bundle's selectors whichever order the stylesheets land in, and it means
    // nothing here writes to the DOM: adding a class to a live panel wakes the
    // observer that called us, and that fed back into itself hard enough to
    // lock the page.
    '#ui .multiplayer-ui > .host {',
    '  top: 6vh;',
    '  max-height: 88vh;',
    '}',
    '#ui .multiplayer-ui > .host > .main-box {',
    '  max-height: 88vh;',
    '  overflow-y: auto;',
    '  overscroll-behavior: contain;',
    '}',
    '#ui .multiplayer-ui > .host > .main-box > h2 {',
    '  position: sticky;',
    '  top: 0;',
    '  z-index: 2;',
    '}',
    '#ui .multiplayer-ui > .host > .main-box > .buttons {',
    '  position: sticky;',
    '  bottom: 0;',
    '  z-index: 2;',
    '  background-color: var(--surface-secondary-color);',
    '}',
    '.gv-round {',
    '  margin: 4px 0 0 0;',
    '  color: var(--text-color);',
    '  opacity: 0.8;',
    '}',
    '.gv-track-empty {',
    '  margin: 0 0 6px 0;',
    '  font-size: 20px;',
    '  color: var(--text-color);',
    '  opacity: 0.6;',
    '}',
    // The public list sits where the join panel does and copies its look,
    // but every one of the game's rules for that panel starts from .join, so
    // none of them reach this one.
    '#ui .multiplayer-ui > .gv-public-rooms {',
    '  position: absolute;',
    '  left: calc(50% - 700px / 2);',
    '  top: 12vh;',
    '}',
    '#ui .multiplayer-ui > .gv-public-rooms.hidden {',
    '  display: none;',
    '}',
    '.gv-public-rooms > .main-box {',
    '  width: 700px;',
    '  box-sizing: border-box;',
    '  background-color: var(--surface-secondary-color);',
    '}',
    '.gv-public-rooms > .main-box > h2 {',
    '  margin: 0 0 10px 0;',
    '  padding: 10px 20px;',
    '  font-weight: normal;',
    '  font-size: 38px;',
    '  text-align: center;',
    '  background-color: var(--surface-color);',
    '  color: var(--text-color);',
    '}',
    '.gv-public-rooms > .main-box > .rows {',
    '  padding: 0 10px;',
    '  max-height: 60vh;',
    '  overflow-y: auto;',
    '  overscroll-behavior: contain;',
    '}',
    '.gv-public-rooms > .main-box > .buttons {',
    '  display: flex;',
    '  justify-content: space-between;',
    '  margin: 10px 0 0 0;',
    '  padding: 10px;',
    '  background-color: var(--surface-color);',
    '}',
    '.gv-public-row {',
    '  display: flex;',
    '  align-items: center;',
    '  margin: 0 0 8px 0;',
    '  padding: 6px 6px 6px 0;',
    '  background-color: var(--surface-color);',
    '}',
    '.gv-public-row > .details {',
    '  flex: 1;',
    '  min-width: 0;',
    '  padding: 0 16px;',
    '}',
    '.gv-public-row > .details > div {',
    '  white-space: nowrap;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  color: var(--text-color);',
    '}',
    '.gv-public-row > .details > .host {',
    '  font-size: 26px;',
    '}',
    '.gv-public-row > .details > .track {',
    '  font-size: 18px;',
    '  opacity: 0.7;',
    '}',
    '.gv-public-note {',
    '  padding: 6px 6px 14px 6px;',
    '  font-size: 22px;',
    '  color: var(--text-color);',
    '  opacity: 0.7;',
    '}'
  ].join('\n');

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var tag = document.createElement('style');
    tag.id = STYLE_ID;
    tag.textContent = STYLE;
    document.head.appendChild(tag);
  }

  function choiceBlock(title, options, current, onPick) {
    var block = document.createElement('div');
    block.className = 'gv-room-option';

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

  // Whether anyone can find the room or only people given its code. It goes
  // above the game's own blocks, because it decides who the rest is for.
  function visibilityBlock() {
    return choiceBlock('Visibility', VISIBILITY, settings.visibility, function (value) {
      settings.visibility = value;
      write();
      tellVisibility();
    });
  }

  // rooms.js opens the room the moment Host is pressed, so it has to know the
  // choice beforehand rather than be told once the room exists.
  function tellVisibility() {
    var rooms = window.GV && window.GV.rooms;
    if (rooms) rooms.setPublic(settings.visibility === 'public');
  }

  // The public list shows what a room is racing on. Before the room exists
  // that is the track picked on the host panel; after, it is whatever the
  // game's toolbar says, however the track was changed.
  function tellTrack(element) {
    var rooms = window.GV && window.GV.rooms;
    if (rooms && element) rooms.setTrack(element.textContent.trim());
  }

  // ── The track list ───────────────────────────────────────────
  // A room plays a sequence of tracks rather than one. The game has no idea
  // about that, so the list lives here and the game is walked through it one
  // track at a time, the same way a person would.
  //
  // Adding one opens the game's own track picker rather than building a second
  // one. Whatever the host clicks in there is both what the game selects and
  // what gets appended, so the two can never disagree.
  //
  // A track is remembered by its thumbnail path, which is unique per track and
  // is also what makes it findable in the picker later.

  function trackPicker() {
    // The game keeps two of these, one for Play and one for hosting, and the
    // idle one stays in the document. Only the visible one is the live one.
    return document.querySelector('.track-selection-ui:not(.hidden)');
  }

  function cardFor(picker, thumbnail) {
    var cards = picker.querySelectorAll('.track');
    for (var i = 0; i < cards.length; i++) {
      var image = cards[i].querySelector('.thumbnail');
      if (image && image.getAttribute('src') === thumbnail) return cards[i];
    }
    return null;
  }

  function readCard(card) {
    var title = card.querySelector('.track-title p') || card.querySelector('.track-title');
    var image = card.querySelector('.thumbnail');
    if (!title || !image) return null;
    return { name: title.textContent.trim(), thumbnail: image.getAttribute('src') };
  }

  // One-shot: the next track the host clicks in the picker is appended.
  var catching = null;

  function catchNextPick(onPicked) {
    if (catching !== null) document.removeEventListener('click', catching, true);
    catching = function (event) {
      var card = event.target.closest ? event.target.closest('.track') : null;
      if (!card || !card.closest('.track-selection-ui')) return;
      var track = readCard(card);
      document.removeEventListener('click', catching, true);
      catching = null;
      if (track) onPicked(track);
    };
    document.addEventListener('click', catching, true);
  }

  function addTrack() {
    var button = document.querySelector('.multiplayer-ui > .host .track-button');
    if (!button) return;
    catchNextPick(function (track) {
      settings.playlist = settings.playlist.concat([track]);
      write();
      refreshPlaylist();
      tellRoom();
    });
    button.click();
  }

  function removeTrack(at) {
    settings.playlist = settings.playlist.filter(function (ignored, i) { return i !== at; });
    write();
    refreshPlaylist();
    tellRoom();
  }

  function playlistBlock() {
    var block = document.createElement('div');
    block.className = 'gv-room-option gv-track-list';

    var heading = document.createElement('div');
    heading.className = 'title';
    heading.textContent = 'Track List';
    block.appendChild(heading);

    var rows = document.createElement('div');
    rows.className = 'rows';
    block.appendChild(rows);

    var add = document.createElement('button');
    add.className = 'button';
    add.textContent = 'Add Track';
    add.addEventListener('click', addTrack);
    block.appendChild(add);

    var info = document.createElement('div');
    info.className = 'info';
    info.textContent = 'Played in order. The room moves on to the next one when a round ends.';
    block.appendChild(info);

    return block;
  }

  // Everything here runs from a MutationObserver, and everything here writes
  // to the DOM, so rebuilding unconditionally means observing our own writes
  // and rebuilding again, forever, until the page stops responding. Nothing is
  // touched unless what would be drawn has actually changed.
  var drawn = null;

  function refreshPlaylist() {
    var rows = document.querySelector('.gv-track-list > .rows');
    if (!rows) return;

    var signature = settings.playlist.map(function (track) { return track.thumbnail; }).join('|');
    if (signature === drawn) return;
    drawn = signature;

    rows.innerHTML = '';

    if (settings.playlist.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'gv-track-empty';
      empty.textContent = 'No tracks yet. The room needs at least one.';
      rows.appendChild(empty);
      return;
    }

    settings.playlist.forEach(function (track, at) {
      var row = document.createElement('div');
      row.className = 'gv-track-row';

      var position = document.createElement('div');
      position.className = 'position';
      position.textContent = String(at + 1);
      row.appendChild(position);

      var image = document.createElement('img');
      image.className = 'thumbnail';
      image.src = track.thumbnail;
      row.appendChild(image);

      var name = document.createElement('div');
      name.className = 'name';
      name.textContent = track.name;
      row.appendChild(name);

      var remove = document.createElement('button');
      remove.className = 'button remove';
      remove.textContent = '\u00d7';
      remove.addEventListener('click', function () { removeTrack(at); });
      row.appendChild(remove);

      rows.appendChild(row);
    });
  }

  // ── Moving through the list ─────────────────────────────────
  // Mid-race the host's toolbar already has a Change Track button, and using
  // it restarts the round on the new track for everyone in the room. So the
  // circuit does not need a mechanism of its own: it needs to press that
  // button and then pick the right track out of the list that opens.
  //
  // Only the host has that button, which is also exactly who should be
  // deciding the room moves on.

  var at = 0;
  var roundEndsAt = null;
  var ticker = null;

  // Which track the room is actually starting on is whatever the game had
  // selected when the host pressed Host, which is not necessarily the first in
  // the list. The host panel is gone by the time the session exists, so the
  // selection is noted while it is still on screen.
  var chosenThumbnail = null;

  function indexOfTrack(thumbnail) {
    for (var i = 0; i < settings.playlist.length; i++) {
      if (settings.playlist[i].thumbnail === thumbnail) return i;
    }
    return 0;
  }

  function toolbarButtons() {
    return document.querySelector('.game-toolbar-ui .button-container');
  }

  function buttonNamed(root, text) {
    if (!root) return null;
    var all = root.querySelectorAll('button, .button');
    for (var i = 0; i < all.length; i++) {
      if (all[i].textContent.trim() === text) return all[i];
    }
    return null;
  }

  // The picker takes a moment to build, and the card wanted may be in a group
  // that has to finish opening, so this waits rather than assuming.
  function whenPickerReady(thumbnail, then, tries) {
    var left = tries === undefined ? 20 : tries;
    var picker = trackPicker();
    var card = picker === null ? null : cardFor(picker, thumbnail);
    if (card !== null && card.querySelector('button').offsetParent !== null) {
      then(card);
      return;
    }
    if (left <= 0) {
      console.error('Rooms: could not find ' + thumbnail + ' in the track picker');
      return;
    }
    setTimeout(function () { whenPickerReady(thumbnail, then, left - 1); }, 250);
  }

  function goToTrack(index) {
    if (settings.playlist.length === 0) return;
    at = ((index % settings.playlist.length) + settings.playlist.length) % settings.playlist.length;
    var track = settings.playlist[at];

    var change = buttonNamed(toolbarButtons(), 'Change Track');
    if (change === null) return;
    change.click();

    whenPickerReady(track.thumbnail, function (card) {
      card.querySelector('button').click();
      restartRound();
      tellRoom();
    });
  }

  function nextTrack() {
    goToTrack(at + 1);
  }

  // ── The round clock ──────────────────────────────────────────
  // A race here has no natural end: in Casual everyone keeps driving for a
  // better time, and nobody crosses a finish line for the last time in any way
  // the game announces. So a round is a length of time, and when it runs out
  // the host moves the room on. Manual leaves that to the host entirely.
  //
  // Only the host counts down and acts on it. Everyone else is told when the
  // round ends so their screen agrees, and does nothing when it does.

  function restartRound() {
    var length = effective().roundSeconds;
    roundEndsAt = length > 0 ? Date.now() + length * 1000 : null;
  }

  function roundTick() {
    var rooms = window.GV && window.GV.rooms;
    renderRound();
    if (!rooms || rooms.state().role !== 'host') return;
    tellTrack(document.querySelector('.game-toolbar-ui .track-name'));
    if (roundEndsAt === null || Date.now() < roundEndsAt) return;
    if (settings.playlist.length < 2) {
      restartRound();
      return;
    }
    nextTrack();
  }

  function startTicking() {
    if (ticker !== null) return;
    ticker = setInterval(roundTick, 1000);
  }

  function stopTicking() {
    if (ticker === null) return;
    clearInterval(ticker);
    ticker = null;
    roundEndsAt = null;
    var line = document.querySelector('.gv-round');
    if (line) line.parentElement.removeChild(line);
  }

  function clock(seconds) {
    var whole = Math.max(0, Math.floor(seconds));
    var minutes = Math.floor(whole / 60);
    var rest = whole % 60;
    return minutes + ':' + (rest < 10 ? '0' : '') + rest;
  }

  // Sits with the track name and game mode the game already shows, because
  // that is where someone looks to find out what they are racing.
  function renderRound() {
    var rooms = window.GV && window.GV.rooms;
    var content = document.querySelector('.game-toolbar-ui .info-container .content');
    if (!content || !rooms || rooms.state().code === null) return;

    var list = effective().playlist || [];
    if (list.length === 0) return;

    var text = 'Track ' + (at + 1) + ' of ' + list.length;
    if (roundEndsAt !== null) text = text + '  \u00b7  ' + clock((roundEndsAt - Date.now()) / 1000);

    var line = content.querySelector('.gv-round');
    if (!line) {
      line = document.createElement('div');
      line.className = 'gv-round';
      content.appendChild(line);
    }
    if (line.textContent !== text) line.textContent = text;
  }

  // ── The in-race button ─────────────────────────────────────
  // Added next to the game's own toolbar buttons so it reads as one of them.
  // It only appears for the host of a room with somewhere to go.

  function fillToolbar() {
    var rooms = window.GV && window.GV.rooms;
    var container = toolbarButtons();
    if (!container) return;

    var wanted = !!rooms && rooms.state().role === 'host' && settings.playlist.length > 1;
    var existing = container.querySelector('.gv-next-track');

    if (!wanted) {
      if (existing) existing.parentElement.removeChild(existing);
      return;
    }
    if (existing) return;

    var button = document.createElement('button');
    button.className = 'button gv-next-track';
    button.textContent = 'Next Track';
    button.addEventListener('click', nextTrack);
    container.appendChild(button);
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
    var wanted = code.value.trim().length > 0 ? '' : 'none';
    // Same reason as the track list: writing an attribute that already holds
    // this value still wakes the observer that called us.
    if (block.style.display !== wanted) block.style.display = wanted;
  }

  function roundLengthBlock() {
    return choiceBlock('Round Length', ROUND_LENGTHS, settings.roundSeconds, function (value) {
      settings.roundSeconds = value;
      write();
      restartRound();
      tellRoom();
    });
  }

  function fillHostPanel(root) {
    var box = root.querySelector(':scope > .host > .main-box');
    if (!box) return;

    var thumbnail = box.querySelector(':scope > .track-button .thumbnail');
    if (thumbnail) chosenThumbnail = thumbnail.getAttribute('src');
    tellTrack(box.querySelector(':scope > .track-button > .name:not(.placeholder)'));

    if (box.querySelector('.gv-room-option')) {
      refreshPlaylist();
      return;
    }
    // A freshly built panel has nothing drawn in it yet.
    drawn = null;
    var buttons = box.querySelector(':scope > .buttons');
    var heading = box.querySelector(':scope > h2');
    if (!buttons || !heading) return;
    box.insertBefore(visibilityBlock(), heading.nextSibling);
    box.insertBefore(playlistBlock(), buttons);
    box.insertBefore(roundLengthBlock(), buttons);
    box.insertBefore(otherCarsBlock(), buttons);
    refreshPlaylist();
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
    rooms.say({ kind: 'settings', settings: settings, at: at, endsAt: roundEndsAt });
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
    // Anything else listens, including a page that has subscribed to the room
    // but has not yet been told it is in one: the channel is live a moment
    // before the role is, and a message dropped in that window used to leave a
    // player racing under the wrong settings until the next broadcast.
    if (!rooms || rooms.state().role === 'host') return;

    // Where the room has got to is the host's to say, whatever the player
    // thinks about how the cars should look.
    if (typeof payload.at === 'number') at = payload.at;
    roundEndsAt = typeof payload.endsAt === 'number' ? payload.endsAt : null;

    // A player who has picked for themselves keeps their pick.
    if (playerPicked) return;

    var next = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      next[key] = payload.settings[key] === undefined ? DEFAULTS[key] : payload.settings[key];
    });
    heard = next;
    active = next;
  }

  // ── Public rooms ─────────────────────────────────────────────
  // The join panel gets a Public Rooms button beside Host, which swaps it for
  // a list of the public rooms still open. Built from the same pieces as the
  // game's own panels, and put next to them so it comes and goes with them.

  var PUBLIC_CLASS = 'gv-public-rooms';

  function publicPanel() {
    var panel = document.createElement('div');
    panel.className = PUBLIC_CLASS + ' hidden';

    var box = document.createElement('div');
    box.className = 'main-box';
    panel.appendChild(box);

    var heading = document.createElement('h2');
    heading.textContent = 'Public Rooms';
    box.appendChild(heading);

    var rows = document.createElement('div');
    rows.className = 'rows';
    box.appendChild(rows);

    var buttons = document.createElement('div');
    buttons.className = 'buttons';
    box.appendChild(buttons);

    var back = document.createElement('button');
    back.className = 'button';
    back.innerHTML = '<img class="button-icon" src="images/back.svg"> ';
    back.appendChild(document.createTextNode('Back'));
    back.addEventListener('click', function () { showPublic(false); });
    buttons.appendChild(back);

    return panel;
  }

  function showPublic(show) {
    var root = document.querySelector('.multiplayer-ui');
    var join = root && root.querySelector(':scope > .join');
    var panel = root && root.querySelector(':scope > .' + PUBLIC_CLASS);
    if (!join || !panel) return;
    join.classList.toggle('hidden', show);
    panel.classList.toggle('hidden', !show);
    if (!show) {
      stopRefreshing();
      return;
    }
    publicNote('Looking for rooms...');
    loadPublic();
    startRefreshing();
  }

  // Rooms open and close while the list is up, so it keeps itself current
  // for as long as it is on screen, and stops once it is not.
  var REFRESH_EVERY = 5000;
  var refreshing = null;

  function startRefreshing() {
    if (refreshing !== null) return;
    refreshing = setInterval(function () {
      var rows = publicRows();
      if (!rows || rows.offsetParent === null) stopRefreshing();
      else loadPublic();
    }, REFRESH_EVERY);
  }

  function stopRefreshing() {
    if (refreshing === null) return;
    clearInterval(refreshing);
    refreshing = null;
  }

  function fillPublicRooms(root) {
    var buttons = root.querySelector(':scope > .join > .main-box > .buttons');
    if (!buttons || buttons.querySelector('.gv-public-button')) return;

    var open = document.createElement('button');
    open.className = 'button gv-public-button';
    open.textContent = 'Public Rooms';
    open.addEventListener('click', function () { showPublic(true); });
    buttons.insertBefore(open, buttons.querySelector(':scope > .join'));

    root.appendChild(publicPanel());
  }

  // Same reason as the track list: redrawing a list that has not changed
  // would reset its scroll and flash under the pointer every few seconds.
  var listed = null;

  function publicRows() {
    return document.querySelector('.' + PUBLIC_CLASS + ' > .main-box > .rows');
  }

  function publicNote(text) {
    var rows = publicRows();
    if (!rows || listed === text) return;
    listed = text;
    rows.innerHTML = '';
    var note = document.createElement('div');
    note.className = 'gv-public-note';
    note.textContent = text;
    rows.appendChild(note);
  }

  function publicRow(room) {
    var row = document.createElement('div');
    row.className = 'gv-public-row';

    var details = document.createElement('div');
    details.className = 'details';
    row.appendChild(details);

    var host = document.createElement('div');
    host.className = 'host';
    host.textContent = (room.host_name || 'Player') + '’s room';
    details.appendChild(host);

    var track = document.createElement('div');
    track.className = 'track';
    track.textContent = room.track_name || 'Picking a track';
    details.appendChild(track);

    var join = document.createElement('button');
    join.className = 'button';
    join.innerHTML = ' <img class="button-icon" src="images/play.svg">';
    join.prepend(document.createTextNode('Join'));
    join.addEventListener('click', function () { joinPublic(room.code); });
    row.appendChild(join);

    return row;
  }

  // Joining goes through the game's own join panel, as if the code had been
  // typed, so there is one way into a room and it is the one the game knows.
  // The code box is faded out while connecting, so the code is never shown.
  function joinPublic(code) {
    var root = document.querySelector('.multiplayer-ui');
    var input = root && root.querySelector(':scope > .join .invite-code');
    var join = root && root.querySelector(':scope > .join > .main-box > .buttons > .join');
    if (!input || !join || typeof code !== 'string') return;

    showPublic(false);
    input.value = code;
    input.dispatchEvent(new Event('input'));
    join.click();
  }

  function drawPublic(list) {
    var rows = publicRows();
    if (!rows) return;
    if (list.length === 0) {
      publicNote('No public rooms right now. Host one and pick Public to be the first.');
      return;
    }

    var signature = JSON.stringify(list);
    if (signature === listed) return;
    listed = signature;

    rows.innerHTML = '';
    list.forEach(function (room) { rows.appendChild(publicRow(room)); });
  }

  function loadPublic() {
    var rooms = window.GV && window.GV.rooms;
    if (!rooms || !publicRows()) return;
    rooms.publicRooms().then(drawPublic, function (error) {
      console.error('Could not load public rooms:', error);
      publicNote('Could not load public rooms. Check your connection and try again.');
    });
  }

  // ── The invite panel ─────────────────────────────────────────
  // A public room is joined from the list, not with a code, so its invite
  // panel says where to find it instead of showing one. The game rebuilds
  // the panel whenever the invite changes, so this is reapplied each time.

  var PUBLIC_INVITE = 'This room is public. Anyone can join it from Public Rooms.';

  function fillInvite() {
    var rooms = window.GV && window.GV.rooms;
    var box = document.querySelector('.invite-ui .invite-code-container');
    if (!box || !rooms || !rooms.state().public) return;

    var title = box.querySelector('.title');
    if (title && title.textContent !== PUBLIC_INVITE) title.textContent = PUBLIC_INVITE;
    var code = box.querySelector('input');
    if (code && code.style.display !== 'none') code.style.display = 'none';
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
      ensureStyles();
      fillHostPanel(rooms);
      fillJoinPanel(rooms);
      fillPublicRooms(rooms);
    }

    fillToolbar();
    fillInvite();
  }

  function start() {
    var rooms = window.GV && window.GV.rooms;
    if (rooms) {
      tellVisibility();
      rooms.onMessage(heardSettings);
      rooms.onState(function (state) {
        if (state.code === null) {
          stopTelling();
          stopTicking();
          stopApplying();
          active = null;
          heard = null;
          // The next room starts by following its own host again.
          playerPicked = false;
          return;
        }
        // A player races under the host's choices, not their own saved ones,
        // so until the first broadcast lands they sit on the defaults rather
        // than briefly applying what they last chose as a host themselves.
        // Unless they already picked on the join screen, which stands.
        at = indexOfTrack(chosenThumbnail);
        // Whatever the host has already said outranks the defaults, so a
        // broadcast that beat this callback is not thrown away.
        if (state.role === 'host') active = settings;
        else if (playerPicked) active = copyOf(settings);
        else active = heard || copyOf(DEFAULTS);
        if (state.role === 'host') restartRound();
        startApplying();
        startTicking();
        if (state.role === 'host') startTelling();
      });
    }

    new MutationObserver(attach).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class']
    });
    attach();
  }

  // A handle on what the lobby currently believes. Rooms fail in ways that are
  // invisible from the outside, where everything connects and one person's
  // screen quietly disagrees with everyone else's, and the only way to tell
  // which is from the console of the machine that is wrong.
  window.GV = window.GV || {};
  window.GV.roomsUi = {
    state: function () {
      return {
        at: at,
        roundEndsAt: roundEndsAt,
        playerPicked: playerPicked,
        active: active,
        settings: settings,
        effective: effective()
      };
    }
  };

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}());

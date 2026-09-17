/**
 * GameVault music player.
 *
 * One <audio> element, one queue, one bar pinned to the bottom of every page.
 * The bar builds its own markup and styles so a page only has to load this
 * file — nothing to add to the HTML.
 *
 * The site is multi-page, so audio cannot survive a navigation. Instead the
 * queue and the playhead are written to localStorage every couple of seconds
 * and restored on the next page, which costs about a second of silence when
 * you click a link. Games run in an iframe on index.html, so playing a game
 * never interrupts the music.
 *
 * Sources, all key-free and CORS-open:
 *   audius  https://api.audius.co        real tracks, seekable
 *   radio   SomaFM / radio-browser       live streams, not seekable
 *   local   /music/*.mp3 in this repo    whatever you add yourself
 *
 * Public surface: window.GV.player. The browse page (/music/) is the only
 * thing that talks to the catalogue APIs; this file just plays what it is
 * handed.
 */
(function () {
  'use strict';

  var KEY = 'gv.player.v1';
  var SAVE_EVERY = 2000;     // ms between playhead writes
  var CHANNEL = 'gv.player'; // so two tabs do not play over each other

  var state = {
    queue: [],
    i: 0,
    pos: 0,
    vol: 0.8,
    muted: false,
    shuffle: false,
    repeat: 'off',   // off | one | all
    playing: false
  };

  var audio = null;
  var bar = null;
  var el = {};             // bar children, filled by buildBar()
  var listeners = [];
  var saveTimer = null;
  var seeking = false;
  var channel = null;

  // ── Storage ─────────────────────────────────────────────────────────────

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.queue)) return;
      state.queue = saved.queue;
      state.i = Math.min(saved.i || 0, Math.max(saved.queue.length - 1, 0));
      state.pos = saved.pos || 0;
      state.vol = typeof saved.vol === 'number' ? saved.vol : 0.8;
      state.muted = !!saved.muted;
      state.shuffle = !!saved.shuffle;
      state.repeat = saved.repeat || 'off';
      state.playing = !!saved.playing;
    } catch (e) {}
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        queue: state.queue, i: state.i, pos: state.pos, vol: state.vol,
        muted: state.muted, shuffle: state.shuffle, repeat: state.repeat,
        playing: state.playing
      }));
    } catch (e) {}
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function current() {
    return state.queue[state.i] || null;
  }

  function isLive(track) {
    return !!track && track.kind === 'radio';
  }

  function clock(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](snapshot()); } catch (e) {}
    }
    paint();
  }

  function snapshot() {
    return {
      track: current(), queue: state.queue.slice(), index: state.i,
      playing: state.playing, shuffle: state.shuffle, repeat: state.repeat,
      volume: state.vol, muted: state.muted
    };
  }

  // ── Audio ───────────────────────────────────────────────────────────────

  function sound() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = state.muted ? 0 : state.vol;

    audio.addEventListener('timeupdate', function () {
      if (!seeking) state.pos = audio.currentTime || 0;
      paintProgress();
    });
    audio.addEventListener('durationchange', paintProgress);
    audio.addEventListener('ended', function () {
      if (state.repeat === 'one') { audio.currentTime = 0; audio.play(); return; }
      next(true);
    });
    audio.addEventListener('play', function () { state.playing = true; announce(); emit(); });
    audio.addEventListener('pause', function () { state.playing = false; emit(); });
    audio.addEventListener('error', function () {
      /* A dead stream should not strand the queue. Radio gets one retry
         because stations drop connections for a moment all the time. */
      var track = current();
      if (isLive(track) && !track._retried) {
        track._retried = true;
        setTimeout(function () { start(state.i, true); }, 1200);
        return;
      }
      note('Could not play that one');
      if (state.queue.length > 1) setTimeout(function () { next(true); }, 900);
    });
    return audio;
  }

  function start(index, autoplay) {
    if (index < 0 || index >= state.queue.length) return;
    state.i = index;
    var track = current();
    if (!track) return;
    var a = sound();
    a.src = track.src;
    a.load();
    state.pos = 0;
    mediaSession(track);
    if (autoplay !== false) {
      a.play().catch(function () { armResume(); });
    }
    save();
    emit();
  }

  /* Browsers refuse play() without a gesture, which is exactly what happens
     after a page change. Wait for the next click or keypress and go then. */
  function armResume() {
    state.playing = false;
    paint();
    var go = function () {
      document.removeEventListener('pointerdown', go, true);
      document.removeEventListener('keydown', go, true);
      if (audio && audio.paused && state.queue.length) audio.play().catch(function () {});
    };
    document.addEventListener('pointerdown', go, true);
    document.addEventListener('keydown', go, true);
  }

  function play(list, index) {
    if (Array.isArray(list) && list.length) {
      state.queue = list.slice();
      index = index || 0;
    }
    if (!state.queue.length) return;
    start(typeof index === 'number' ? index : state.i, true);
  }

  function toggle() {
    if (!state.queue.length) return;
    var a = sound();
    if (!a.src) { start(state.i, true); return; }
    if (a.paused) a.play().catch(function () { armResume(); });
    else a.pause();
    save();
  }

  function pickNext() {
    if (state.shuffle && state.queue.length > 1) {
      var n = state.i;
      while (n === state.i) n = Math.floor(Math.random() * state.queue.length);
      return n;
    }
    return state.i + 1;
  }

  function next(auto) {
    if (!state.queue.length) return;
    var n = pickNext();
    if (n >= state.queue.length) {
      if (state.repeat === 'all' || state.shuffle) n = 0;
      else if (auto) { if (audio) audio.pause(); state.pos = 0; save(); emit(); return; }
      else n = 0;
    }
    start(n, true);
  }

  function prev() {
    if (!state.queue.length) return;
    /* Same as every other player: the first press restarts the track. */
    if (audio && audio.currentTime > 3 && !isLive(current())) { audio.currentTime = 0; return; }
    start(state.i > 0 ? state.i - 1 : state.queue.length - 1, true);
  }

  function seek(sec) {
    if (!audio || isLive(current())) return;
    audio.currentTime = Math.max(0, sec);
    state.pos = audio.currentTime;
    save();
  }

  function setVolume(v) {
    state.vol = Math.min(1, Math.max(0, v));
    state.muted = false;
    if (audio) audio.volume = state.vol;
    save();
    emit();
  }

  function toggleMute() {
    state.muted = !state.muted;
    if (audio) audio.volume = state.muted ? 0 : state.vol;
    save();
    emit();
  }

  function enqueue(track, playNow) {
    state.queue.push(track);
    if (playNow || state.queue.length === 1) start(state.queue.length - 1, true);
    else { save(); emit(); note('Added to queue'); }
  }

  function removeAt(index) {
    if (index < 0 || index >= state.queue.length) return;
    var wasCurrent = index === state.i;
    state.queue.splice(index, 1);
    if (!state.queue.length) { stop(); return; }
    if (index < state.i) state.i--;
    if (wasCurrent) start(Math.min(state.i, state.queue.length - 1), state.playing);
    else { save(); emit(); }
  }

  function clear() { stop(); }

  function stop() {
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    state.queue = [];
    state.i = 0;
    state.pos = 0;
    state.playing = false;
    save();
    emit();
  }

  /* Media keys, the lock screen and the macOS Now Playing widget. */
  function mediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title || 'GameVault',
        artist: track.artist || '',
        album: track.kind === 'radio' ? 'Radio' : 'GameVault',
        artwork: track.art ? [{ src: track.art, sizes: '512x512', type: 'image/jpeg' }] : []
      });
      navigator.mediaSession.setActionHandler('play', toggle);
      navigator.mediaSession.setActionHandler('pause', toggle);
      navigator.mediaSession.setActionHandler('nexttrack', function () { next(false); });
      navigator.mediaSession.setActionHandler('previoustrack', prev);
    } catch (e) {}
  }

  /* Two tabs playing at once is never what anyone wants. */
  function announce() {
    if (!channel) return;
    try { channel.postMessage({ type: 'playing', at: Date.now() }); } catch (e) {}
  }

  // ── Bar ─────────────────────────────────────────────────────────────────

  var CSS = [
    '.gv-player{position:fixed;left:0;right:0;bottom:0;z-index:9000;display:flex;align-items:center;gap:0.75rem;',
    'padding:0.6rem 0.9rem;background:rgba(12,12,16,0.92);backdrop-filter:blur(14px);',
    'border-top:1px solid rgba(255,255,255,0.09);font-family:"Space Grotesk",system-ui,sans-serif;color:#f4f4f6}',
    '.gv-player[hidden]{display:none}',
    '.gv-art{width:42px;height:42px;border-radius:8px;object-fit:cover;background:#1a1a20;flex-shrink:0}',
    '.gv-meta{min-width:0;width:170px;flex-shrink:0}',
    '.gv-title{font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.gv-artist{font-size:0.72rem;color:#8a8a96;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.gv-btn{background:none;border:0;color:#f4f4f6;cursor:pointer;padding:0.3rem;line-height:0;border-radius:8px;opacity:0.85}',
    '.gv-btn:hover{opacity:1;background:rgba(255,255,255,0.07)}',
    '.gv-btn[aria-pressed="true"]{color:#ff3b3b;opacity:1}',
    '.gv-btn svg{width:18px;height:18px;fill:currentColor}',
    '.gv-play svg{width:24px;height:24px}',
    '.gv-track{display:flex;align-items:center;gap:0.5rem;flex:1;min-width:0}',
    '.gv-time{font-family:"JetBrains Mono",monospace;font-size:0.68rem;color:#8a8a96;flex-shrink:0;width:34px;text-align:center}',
    '.gv-range{-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;background:rgba(255,255,255,0.14);outline:none;cursor:pointer}',
    '.gv-range::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;background:#f4f4f6}',
    '.gv-range::-moz-range-thumb{width:11px;height:11px;border:0;border-radius:50%;background:#f4f4f6}',
    '.gv-seek{flex:1;min-width:60px}',
    '.gv-vol{width:74px;flex-shrink:0}',
    '.gv-live{font-family:"JetBrains Mono",monospace;font-size:0.64rem;letter-spacing:0.08em;color:#ff3b3b;flex:1}',
    '.gv-right{display:flex;align-items:center;gap:0.35rem;flex-shrink:0}',
    '.gv-note{position:fixed;left:50%;transform:translateX(-50%);bottom:74px;z-index:9001;background:rgba(12,12,16,0.95);',
    'border:1px solid rgba(255,255,255,0.12);border-radius:999px;padding:0.4rem 0.9rem;font-size:0.76rem;',
    'font-family:"Space Grotesk",system-ui,sans-serif;color:#f4f4f6;opacity:0;transition:opacity 0.2s;pointer-events:none}',
    '.gv-note.show{opacity:1}',
    'body.gv-playing{padding-bottom:66px}',
    '@media (max-width:760px){.gv-meta{width:auto;flex:1}.gv-seek,.gv-vol,.gv-time{display:none}}'
  ].join('');

  var ICON = {
    prev: '<path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>',
    next: '<path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>',
    shuffle: '<path d="M17 3l4 4-4 4V8h-2.2l-2.6 3.2 2.6 3.2H17v-3l4 4-4 4v-3h-3.2l-3-3.7L7 16H3v-2h3l3.8-4.6L7 6H3V4h4l3.8 4.6L13.8 5H17z"/>',
    repeat: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/>',
    repeatOne: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2zm-5-4h1.5v-4h-3v1.2H12z"/>',
    vol: '<path d="M4 9v6h4l5 4V5L8 9zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9zm15.5 3 2-2-1.1-1.1-2 2-2-2L15.3 10l2 2-2 2 1.1 1.1 2-2 2 2 1.1-1.1z"/>',
    list: '<path d="M4 6h11v2H4zm0 5h11v2H4zm0 5h8v2H4zm13-6 5 4-5 4z"/>',
    close: '<path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/>'
  };

  function svg(path) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
  }

  function buildBar() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    bar = document.createElement('div');
    bar.className = 'gv-player';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Music player');
    bar.hidden = true;
    bar.innerHTML =
      '<img class="gv-art" alt="">' +
      '<div class="gv-meta"><div class="gv-title"></div><div class="gv-artist"></div></div>' +
      '<button class="gv-btn gv-prev" title="Previous" aria-label="Previous">' + svg(ICON.prev) + '</button>' +
      '<button class="gv-btn gv-play" title="Play" aria-label="Play">' + svg(ICON.play) + '</button>' +
      '<button class="gv-btn gv-next" title="Next" aria-label="Next">' + svg(ICON.next) + '</button>' +
      '<div class="gv-track">' +
        '<span class="gv-time gv-now">0:00</span>' +
        '<input class="gv-range gv-seek" type="range" min="0" max="1000" value="0" aria-label="Seek">' +
        '<span class="gv-time gv-dur">0:00</span>' +
        '<span class="gv-live" hidden>● LIVE</span>' +
      '</div>' +
      '<div class="gv-right">' +
        '<button class="gv-btn gv-shuffle" title="Shuffle" aria-label="Shuffle" aria-pressed="false">' + svg(ICON.shuffle) + '</button>' +
        '<button class="gv-btn gv-repeat" title="Repeat" aria-label="Repeat" aria-pressed="false">' + svg(ICON.repeat) + '</button>' +
        '<button class="gv-btn gv-mute" title="Mute" aria-label="Mute">' + svg(ICON.vol) + '</button>' +
        '<input class="gv-range gv-vol" type="range" min="0" max="100" value="80" aria-label="Volume">' +
        '<a class="gv-btn gv-browse" href="/music/" title="Browse music" aria-label="Browse music">' + svg(ICON.list) + '</a>' +
        '<button class="gv-btn gv-close" title="Close player" aria-label="Close player">' + svg(ICON.close) + '</button>' +
      '</div>';
    document.body.appendChild(bar);

    el.art = bar.querySelector('.gv-art');
    el.title = bar.querySelector('.gv-title');
    el.artist = bar.querySelector('.gv-artist');
    el.play = bar.querySelector('.gv-play');
    el.now = bar.querySelector('.gv-now');
    el.dur = bar.querySelector('.gv-dur');
    el.seek = bar.querySelector('.gv-seek');
    el.live = bar.querySelector('.gv-live');
    el.shuffle = bar.querySelector('.gv-shuffle');
    el.repeat = bar.querySelector('.gv-repeat');
    el.mute = bar.querySelector('.gv-mute');
    el.vol = bar.querySelector('.gv-vol');

    bar.querySelector('.gv-prev').addEventListener('click', prev);
    el.play.addEventListener('click', toggle);
    bar.querySelector('.gv-next').addEventListener('click', function () { next(false); });
    bar.querySelector('.gv-close').addEventListener('click', clear);
    el.shuffle.addEventListener('click', function () {
      state.shuffle = !state.shuffle; save(); emit();
    });
    el.repeat.addEventListener('click', function () {
      state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
      save(); emit();
    });
    el.mute.addEventListener('click', toggleMute);
    el.vol.addEventListener('input', function () { setVolume(el.vol.value / 100); });

    el.seek.addEventListener('pointerdown', function () { seeking = true; });
    el.seek.addEventListener('change', function () {
      var d = audio && isFinite(audio.duration) ? audio.duration : 0;
      seeking = false;
      if (d) seek(d * (el.seek.value / 1000));
    });
    el.seek.addEventListener('input', function () {
      var d = audio && isFinite(audio.duration) ? audio.duration : 0;
      if (d) el.now.textContent = clock(d * (el.seek.value / 1000));
    });
  }

  function paint() {
    if (!bar) return;
    var track = current();
    var show = !!track;
    bar.hidden = !show;
    document.body.classList.toggle('gv-playing', show);
    if (!show) return;

    el.title.textContent = track.title || 'Unknown';
    el.artist.textContent = track.artist || '';
    if (track.art) { el.art.src = track.art; el.art.hidden = false; }
    else { el.art.removeAttribute('src'); }
    el.play.innerHTML = svg(state.playing ? ICON.pause : ICON.play);
    el.play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');

    var live = isLive(track);
    el.live.hidden = !live;
    el.seek.hidden = live;
    el.now.hidden = live;
    el.dur.hidden = live;

    el.shuffle.setAttribute('aria-pressed', state.shuffle ? 'true' : 'false');
    el.repeat.setAttribute('aria-pressed', state.repeat === 'off' ? 'false' : 'true');
    el.repeat.innerHTML = svg(state.repeat === 'one' ? ICON.repeatOne : ICON.repeat);
    el.mute.innerHTML = svg(state.muted ? ICON.mute : ICON.vol);
    el.vol.value = Math.round((state.muted ? 0 : state.vol) * 100);
    paintProgress();
  }

  function paintProgress() {
    if (!bar || !audio || seeking) return;
    var d = isFinite(audio.duration) ? audio.duration : 0;
    el.now.textContent = clock(audio.currentTime || 0);
    el.dur.textContent = d ? clock(d) : '0:00';
    el.seek.value = d ? Math.round((audio.currentTime / d) * 1000) : 0;
  }

  var noteEl = null, noteTimer = null;
  function note(text) {
    if (!noteEl) {
      noteEl = document.createElement('div');
      noteEl.className = 'gv-note';
      document.body.appendChild(noteEl);
    }
    noteEl.textContent = text;
    noteEl.classList.add('show');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { noteEl.classList.remove('show'); }, 1800);
  }

  // ── Keyboard ────────────────────────────────────────────────────────────

  function typing(e) {
    var t = e.target;
    if (!t) return false;
    var tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
  }

  function keys(e) {
    if (!state.queue.length || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); }
    else if (k === 'n') next(false);
    else if (k === 'm') toggleMute();
    else if (k === 'arrowright' && e.shiftKey) seek((audio ? audio.currentTime : 0) + 10);
    else if (k === 'arrowleft' && e.shiftKey) seek((audio ? audio.currentTime : 0) - 10);
  }

  // ── Boot ────────────────────────────────────────────────────────────────

  function boot() {
    buildBar();
    if (state.queue.length) {
      var a = sound();
      a.src = current().src;
      if (!isLive(current()) && state.pos) {
        a.addEventListener('loadedmetadata', function once() {
          a.removeEventListener('loadedmetadata', once);
          try { a.currentTime = state.pos; } catch (e) {}
        });
      }
      mediaSession(current());
      // Picking up where the last page left off needs a gesture in most
      // browsers, so try, and fall back to waiting for one.
      if (state.playing) a.play().catch(function () { armResume(); });
    }
    paint();

    document.addEventListener('keydown', keys);
    window.addEventListener('pagehide', save);
    saveTimer = setInterval(function () { if (state.playing) save(); }, SAVE_EVERY);

    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = function (e) {
        if (e.data && e.data.type === 'playing' && audio && !audio.paused) audio.pause();
      };
    }
  }

  load();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.GV = window.GV || {};
  window.GV.player = {
    play: play,
    enqueue: enqueue,
    toggle: toggle,
    next: function () { next(false); },
    prev: prev,
    seek: seek,
    removeAt: removeAt,
    clear: clear,
    setVolume: setVolume,
    state: snapshot,
    position: function () { return audio ? (audio.currentTime || 0) : state.pos; },
    note: note,
    onChange: function (fn) { listeners.push(fn); fn(snapshot()); }
  };
})();

// Friends asking to join this player's room.
//
// A friend on the site asks to join (sql/social.sql), and the ask comes back
// on this game's presence beat (creator.js). It shows here as a notice:
// Accept opens a room if the player is racing alone and hands its code back,
// and the site walks the friend's game in after it. The × turns it down.
(function () {
  'use strict';

  // The beat hands an ask back for its first minute, so a notice is not
  // left up past that.
  var LASTS_MS = 60000;

  var STYLE_ID = 'gv-ask-style';

  // In the same corner as the creator's notice, above the speedometer, where
  // nothing in a race is drawn. Several stack upwards.
  var STYLE = [
    '.gv-asks {',
    '  position: absolute; right: 20px; bottom: 110px; z-index: 5;',
    '  display: flex; flex-direction: column-reverse; gap: 8px; align-items: flex-end;',
    // #ui is pointer-events: none so the canvas can be dragged through it.
    '  pointer-events: none; }',
    '.gv-ask {',
    '  display: flex; align-items: center; gap: 10px; max-width: 520px;',
    '  padding: 10px 10px 10px 18px; box-sizing: border-box;',
    '  background-color: var(--surface-color); border-left: 4px solid #1d9bf0;',
    '  color: var(--text-color); font-size: 22px; line-height: 1.25;',
    '  pointer-events: auto; }',
    '.gv-ask > .button { margin: 0; padding: 4px 14px; font-size: 22px; }',
    '.gv-ask > .button:disabled { opacity: 0.5; }'
  ].join('\n');

  var shown = {};

  function creator() {
    return (window.GV && window.GV.creator) || null;
  }

  function stack() {
    var ui = document.getElementById('ui');
    if (!ui) return null;
    if (!document.getElementById(STYLE_ID)) {
      var css = document.createElement('style');
      css.id = STYLE_ID;
      css.textContent = STYLE;
      document.head.appendChild(css);
    }
    var box = ui.querySelector('.gv-asks');
    if (!box) {
      box = document.createElement('div');
      box.className = 'gv-asks';
      ui.appendChild(box);
    }
    return box;
  }

  function button(label, onClick) {
    var el = document.createElement('button');
    el.className = 'button';
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  }

  function answer(id, code) {
    return creator().rpc('gv_join_answer', { p_id: id, p_code: code });
  }

  function show(ask) {
    if (!ask || shown[ask.id]) return;
    var box = stack();
    if (!box) return;

    var notice = document.createElement('div');
    notice.className = 'gv-ask';
    notice.setAttribute('role', 'status');
    var text = document.createElement('span');
    text.textContent = (ask.name || 'A friend') + ' wants to join your room';
    notice.appendChild(text);

    function close() {
      notice.remove();
    }

    var accept = button('Accept', function () {
      accept.disabled = true;
      text.textContent = 'Letting ' + (ask.name || 'them') + ' in...';
      creator().host()
        .then(function (code) { return answer(ask.id, code); })
        .then(function () {
          text.textContent = (ask.name || 'Your friend') + ' is on the way';
          no.remove();
          accept.remove();
          setTimeout(close, 5000);
        })
        .catch(function (error) {
          text.textContent = /host can let/.test(error.message)
            ? error.message
            : 'Could not let ' + (ask.name || 'them') + ' in.';
          accept.remove();
        });
    });

    var no = button('\u00d7', function () {
      answer(ask.id, null).catch(function (error) {
        console.error('Could not turn down the ask:', error);
      });
      close();
    });
    no.setAttribute('aria-label', 'Turn down');

    notice.appendChild(accept);
    notice.appendChild(no);
    box.appendChild(notice);
    shown[ask.id] = true;

    // Nobody answered in time, and the friend has stopped waiting.
    setTimeout(function () {
      if (!accept.disabled) close();
    }, LASTS_MS);
  }

  function start() {
    var gv = creator();
    if (!gv) return;
    gv.onBeat(function (reply) {
      (reply && reply.asks || []).forEach(show);
    });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}());

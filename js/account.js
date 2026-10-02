/* Deleting a GameVault account, from the profile panel or the settings page.
   A dialog says what goes, and typing the username is the confirmation.
   sql/account.sql does the deleting.
   Public surface: window.GV.account. */
(function () {
  'use strict';

  var GONE = [
    'Your username and profile picture',
    'Play time, stars, levels and stats',
    'Cloud saves and your PolyTrack save',
    'Your PolyTrack times on every leaderboard, challenge runs and badges',
    'Coins and shop items',
    'Chat messages, direct messages, group chats and friends',
    'Your visits in the site\u2019s stats'
  ];

  // What this browser keeps for the account. The rest of what it stores is
  // the browser's own, like settings and game saves.
  var LOCAL = ['gv.username', 'gv.ptsave.user', 'gv.ptsave.at', 'gv.ptsave.dirty'];

  var CSS = [
    '.gv-del{position:fixed;inset:0;z-index:2600;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6)}',
    '.gv-del-card{width:min(420px,100%);max-height:calc(100vh - 32px);overflow-y:auto;box-sizing:border-box;padding:22px;border-radius:18px;background:var(--surface,#121216);border:1px solid var(--border-strong,rgba(255,255,255,.16));box-shadow:0 20px 60px rgba(0,0,0,.6);color:var(--text,#f4f4f6);font-size:.88rem;line-height:1.5}',
    '.gv-del-card h2{margin:0 0 6px;font-size:1.1rem}',
    '.gv-del-card p{margin:0 0 10px;color:var(--muted,#8a8a96)}',
    '.gv-del-card ul{margin:0 0 12px;padding-left:18px}',
    '.gv-del-card li{margin:2px 0}',
    '.gv-del-card label{display:block;margin:12px 0 6px;font-size:.8rem;color:var(--muted,#8a8a96)}',
    '.gv-del-card input{width:100%;box-sizing:border-box;padding:9px 12px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.07));background:var(--surface-2,#1a1a20);color:var(--text,#f4f4f6);font:inherit;outline:none}',
    '.gv-del-card input:focus{border-color:var(--accent,#ff3b3b)}',
    '.gv-del-row{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}',
    '.gv-del-row button{padding:8px 16px;border-radius:100px;border:1px solid var(--border-strong,rgba(255,255,255,.16));background:transparent;color:var(--text,#f4f4f6);font:inherit;font-size:.82rem;font-weight:600;cursor:pointer}',
    '.gv-del-row .go{background:var(--accent,#ff3b3b);border-color:transparent;color:#fff}',
    '.gv-del-row button:disabled{opacity:.4;cursor:default}',
    '.gv-del-msg{min-height:1.2rem;margin-top:10px;font-size:.8rem;color:var(--muted,#8a8a96)}',
    '.gv-del-msg.error{color:#ff7a7a}'
  ].join('');

  function style() {
    if (document.getElementById('gvDeleteCss')) return;
    var st = document.createElement('style');
    st.id = 'gvDeleteCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function el(tag, text) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = text;
    return node;
  }

  function forget(userId) {
    LOCAL.concat(['gv.chat.server.' + userId]).forEach(function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    });
    if (window.GV && GV.identity && GV.identity.setAccountName) GV.identity.setAccountName(null);
  }

  // Resolves true once the account is gone, false if the dialog was closed.
  // opts: { name, userId }
  function confirmDelete(sb, opts) {
    style();
    return new Promise(function (resolve) {
      var name = (opts && opts.name) || '';
      var shade = el('div');
      shade.className = 'gv-del';
      var card = el('div');
      card.className = 'gv-del-card';
      card.setAttribute('role', 'alertdialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', 'gvDelTitle');

      var title = el('h2', 'Delete your account?');
      title.id = 'gvDelTitle';
      card.appendChild(title);
      card.appendChild(el('p', 'This is for good and cannot be undone. All of this goes, everywhere on GameVault:'));
      var list = el('ul');
      GONE.forEach(function (line) { list.appendChild(el('li', line)); });
      card.appendChild(list);
      card.appendChild(el('p', 'Games you sent in stay on the site, without your name.'));

      var label = el('label', 'Type your username (' + name + ') to confirm');
      label.htmlFor = 'gvDelName';
      var input = el('input');
      input.id = 'gvDelName';
      input.autocomplete = 'off';
      input.spellcheck = false;
      card.appendChild(label);
      card.appendChild(input);

      var msg = el('div');
      msg.className = 'gv-del-msg';
      msg.setAttribute('aria-live', 'polite');
      var row = el('div');
      row.className = 'gv-del-row';
      var cancel = el('button', 'Cancel');
      cancel.type = 'button';
      var go = el('button', 'Delete everything');
      go.type = 'button';
      go.className = 'go';
      go.disabled = true;
      row.appendChild(cancel);
      row.appendChild(go);
      card.appendChild(row);
      card.appendChild(msg);
      shade.appendChild(card);
      document.body.appendChild(shade);
      setTimeout(function () { input.focus(); });

      var busy = false;
      function done(result) {
        shade.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(result);
      }
      function onKey(e) {
        if (e.key !== 'Escape' || busy) return;
        e.stopImmediatePropagation();
        done(false);
      }
      document.addEventListener('keydown', onKey, true);
      cancel.addEventListener('click', function () { if (!busy) done(false); });
      shade.addEventListener('click', function (e) { if (e.target === shade && !busy) done(false); });
      input.addEventListener('input', function () {
        go.disabled = input.value.trim().toLowerCase() !== name.toLowerCase();
      });

      go.addEventListener('click', function () {
        if (go.disabled || busy) return;
        busy = true;
        go.disabled = true;
        cancel.disabled = true;
        input.disabled = true;
        msg.className = 'gv-del-msg';
        msg.textContent = 'Deleting\u2026';
        removeEverything(sb, opts.userId).then(function () {
          card.textContent = '';
          card.appendChild(el('h2', 'Your account is deleted.'));
          card.appendChild(el('p', 'Everything that was tied to it is gone.'));
          var close = el('button', 'Close');
          close.type = 'button';
          var end = el('div');
          end.className = 'gv-del-row';
          end.appendChild(close);
          card.appendChild(end);
          busy = false;
          close.addEventListener('click', function () { done(true); });
          close.focus();
        }, function (error) {
          busy = false;
          cancel.disabled = false;
          input.disabled = false;
          go.disabled = false;
          msg.className = 'gv-del-msg error';
          msg.textContent = 'Could not delete: ' + (error.message || 'try again in a moment.');
        });
      });
    });
  }

  // Storage files cannot be removed from SQL, so they go first, from here.
  function removeEverything(sb, userId) {
    return sb.storage.from('saves').list(userId)
      .then(function (res) {
        var files = res && res.data;
        if (!files || !files.length) return null;
        return sb.storage.from('saves').remove(files.map(function (f) { return userId + '/' + f.name; }));
      })
      .catch(function () { return null; })
      .then(function () { return sb.rpc('gv_delete_account'); })
      .then(function (res) {
        if (res.error) throw new Error(res.error.message);
        forget(userId);
        return sb.auth.signOut({ scope: 'local' });
      });
  }

  window.GV = window.GV || {};
  window.GV.account = { confirmDelete: confirmDelete };
}());

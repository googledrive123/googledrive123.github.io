/* GameVault polls (polls/polls.sql). The newest open poll someone has not
   answered pops up when they come to the site, and they can vote right in
   it. /polls/ shows every poll. One vote each: per account, and per browser
   for a guest.
   Public surface: window.GV.polls.ask(), .card(poll), .use(client), .rpc. */
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';

  var CSS = [
    '.gv-poll{text-align:left}',
    '.gv-poll-q{margin:.5rem 0 1rem;font-size:1.2rem;font-weight:700;line-height:1.3;letter-spacing:-.01em;color:var(--text,#f4f4f6);overflow-wrap:anywhere}',
    '.gv-poll-opts{display:flex;flex-direction:column;gap:8px}',
    '.gv-poll-opt{position:relative;width:100%;display:flex;align-items:center;gap:10px;padding:11px 14px;overflow:hidden;border-radius:10px;border:1px solid var(--border-strong,rgba(255,255,255,.16));background:var(--surface-2,#1a1a20);color:var(--text,#f4f4f6);font:inherit;font-size:.92rem;text-align:left;cursor:pointer;transition:border-color .15s}',
    'button.gv-poll-opt:hover{border-color:var(--accent,#ff3b3b)}',
    'button.gv-poll-opt:disabled{cursor:default;opacity:.6}',
    '.gv-poll-opt span{position:relative;min-width:0;overflow-wrap:anywhere}',
    '.gv-poll-opt .gv-poll-name{flex:1}',
  ].join('');

  var client = null;

  function style() {
    if (document.getElementById('gvPollsCss')) return;
    var st = document.createElement('style');
    st.id = 'gvPollsCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // A page with its own Supabase client hands it over here, so a signed-in
  // player votes as their account.
  function use(sb) {
    client = sb;
  }

  // As the account when someone is signed in, otherwise as a guest with the
  // site's public key. Every refusal is a sentence to show as it is.
  function rpc(name, args) {
    if (client) {
      return client.rpc(name, args).then(function (res) {
        if (res.error) throw new Error(res.error.code === 'P0001' ? res.error.message : 'Could not reach GameVault. Try again.');
        return res.data;
      });
    }
    return fetch(SUPA_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        if (!r.ok) throw new Error(body && body.code === 'P0001' ? body.message : 'Could not reach GameVault. Try again.');
        return body;
      });
    });
  }

  // This browser's id (js/identity.js), which a guest votes as.
  function visitor() {
    var id = window.GV && GV.identity;
    if (id && id.ready) return id.ready.then(function (v) { return v || id.id(); });
    try { return Promise.resolve(localStorage.getItem('gv.vid')); } catch (e) { return Promise.resolve(null); }
  }

  // One poll and the answers to pick from.
  function card(poll) {
    style();
    var box = el('div', 'gv-poll');
    var q = el('h3', 'gv-poll-q', poll.question);
    var opts = el('div', 'gv-poll-opts');
    box.appendChild(q);
    box.appendChild(opts);

    function paint(p) {
      opts.textContent = '';
      (p.options || []).forEach(function (name, i) {
        var row = el('button', 'gv-poll-opt');
        row.type = 'button';
        row.appendChild(el('span', 'gv-poll-name', name));
        row.disabled = !p.open;
        opts.appendChild(row);
      });
    }

    paint(poll);
    return box;
  }

  window.GV = window.GV || {};
  window.GV.polls = {
    card: card,
    use: use,
    rpc: rpc,
    visitor: visitor
  };
}());

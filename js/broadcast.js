/* GameVault broadcasts: the owner's message across the top of every page.
   Sent from /analytics/ with a mode (see analytics/broadcasts.sql):
     now   - only tabs that were already open when it was sent
     later - only tabs opened after it was sent
     both  - every tab
   A tab's arrival is the server's time at its first poll, kept for the life
   of the tab in sessionStorage, so reloading does not make someone "arrive"
   again. Loaded by index.html and, through site.js, every other page. */
(function () {
  'use strict';

  var URL_ = 'https://dxwjxzmlezfyursysays.supabase.co/rest/v1/rpc/gv_broadcasts';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  var POLL_MS = 60000;
  var ARRIVAL_KEY = 'gv.arrival';
  var SEEN_KEY = 'gv.broadcasts.seen';

  function seen() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; }
  }
  function markSeen(id) {
    var list = seen().filter(function (x) { return x !== id; });
    list.push(id);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-50))); } catch (e) {}
  }

  // The server time this tab first heard from the site, or null before that.
  function arrival() {
    try { return sessionStorage.getItem(ARRIVAL_KEY); } catch (e) { return null; }
  }

  function meant(item, arrived) {
    var sent = Date.parse(item.created_at), came = Date.parse(arrived);
    if (item.mode === 'now') return sent > came;
    if (item.mode === 'later') return sent <= came;
    return true;
  }

  var bar = null;
  function show(item) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'gvBroadcast';
      bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2000;display:flex;align-items:center;gap:0.75rem;' +
        'padding:0.6rem 1rem;background:linear-gradient(90deg,#2a0d0d,#1a1a20);border-bottom:1px solid #ff3b3b;' +
        'color:#f4f4f6;font:500 0.88rem/1.4 "Space Grotesk",system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.5)';
      var tag = document.createElement('span');
      tag.textContent = 'MESSAGE';
      tag.style.cssText = 'flex-shrink:0;font:600 0.6rem "JetBrains Mono",monospace;letter-spacing:0.18em;color:#ff3b3b';
      var text = document.createElement('span');
      text.className = 'gv-bc-text';
      text.style.cssText = 'flex:1;min-width:0;overflow-wrap:anywhere';
      var close = document.createElement('button');
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss');
      close.textContent = '✕';
      close.style.cssText = 'flex-shrink:0;background:none;border:0;color:#8a8a96;font-size:1rem;cursor:pointer;padding:0.2rem 0.4rem';
      bar.append(tag, text, close);
      close.addEventListener('click', function () {
        markSeen(Number(bar.dataset.id));
        bar.remove();
        bar = null;
        poll();
      });
    }
    bar.dataset.id = item.id;
    bar.querySelector('.gv-bc-text').textContent = item.message;
    if (!bar.isConnected) document.body.appendChild(bar);
  }

  // The newest broadcast this tab should see and has not dismissed. Anything
  // stopped or expired simply stops coming back, and the bar goes with it.
  function poll() {
    if (document.hidden) return;
    fetch(URL_, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data) return;
      var arrived = arrival();
      if (!arrived) {
        arrived = data.now;
        try { sessionStorage.setItem(ARRIVAL_KEY, arrived); } catch (e) {}
      }
      var dismissed = seen();
      var pick = null;
      data.items.forEach(function (it) {
        if (dismissed.indexOf(it.id) === -1 && meant(it, arrived)) pick = it;
      });
      if (pick) show(pick);
      else if (bar) { bar.remove(); bar = null; }
    }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poll);
  else poll();
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
})();

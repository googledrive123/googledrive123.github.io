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
    if (item.mode === 'now') return item.created_at > arrived;
    if (item.mode === 'later') return item.created_at <= arrived;
    return true;
  }
})();

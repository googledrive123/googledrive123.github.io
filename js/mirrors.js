/*
 * GameVault backup addresses
 * --------------------------
 * The site also runs at other github.io addresses: forks that copy every
 * change from this one once a day (.github/workflows/sync.yml). Schools block
 * sites one address at a time, so when one is blocked another usually still
 * works. The owner lists them from the dashboard (gv_mirrors, sql/mirrors.sql).
 *
 * Progress does not follow on its own. localStorage and IndexedDB belong to
 * one address, so a new one starts empty. moveSaves() carries this browser's
 * progress to a tab it opens at the other address, over postMessage, the one
 * way two addresses can hand each other data inside a browser.
 *
 * Public surface: window.GV.mirrors. Moving saves needs /js/saves.js too.
 */
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  var MAIN = 'https://googledrive123.github.io';

  function rpc(name, args) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      if (!r.ok) throw new Error(name + ' ' + r.status);
      return r.json();
    });
  }

  function withMain(rows) {
    var items = [{ origin: MAIN, label: 'Main address', main: true }];
    (rows || []).forEach(function (r) {
      if (r && r.origin && r.origin !== MAIN) items.push({ origin: r.origin, label: r.label || '', main: false });
    });
    return items;
  }

  /* The main address first, then every one the owner added: [{origin, label,
     main}]. */
  var listing = null;
  function list() {
    if (!listing) {
      listing = rpc('gv_mirrors_list').then(function (rows) {
        return withMain(rows);
      }, function (err) {
        listing = null;
        throw err;
      });
    }
    return listing;
  }

  window.GV = window.GV || {};
  window.GV.mirrors = {
    MAIN: MAIN,
    list: list
  };
})();

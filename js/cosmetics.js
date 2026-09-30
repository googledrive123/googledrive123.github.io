/* GameVault cosmetics.
   What players wear from the shop (/shop/): a name color, a ring around the
   avatar and a title. They only change how a name looks. Any page can show
   them, signed in or not: this fetches the public gv_public_cosmetics
   function (shop/shop.sql) with the site's anon key and needs nothing else.

   Public surface: window.GV.cosmetics
     load(userIds)              -> Promise<{ [userId]: cosmetics }>
     forget(userId)             drops a cached entry, e.g. after equipping

   A cosmetics object is keyed by kind, each an item as the server sends it:
     { name_color: { id, name, rarity, value }, avatar_frame: {...}, title: {...} }
   Players wearing nothing are missing from load's map. Every apply* takes
   undefined too, and undoes whatever it set on that element before. */
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';

  // Long enough that a chat full of the same few names asks once, short
  // enough that a new ring shows up for everyone within a minute.
  var TTL = 60 * 1000;
  var BATCH = 200; // the most ids gv_public_cosmetics reads in one call

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var HEX = /^#[0-9a-f]{3,8}$/i;

  var cache = {};   // id -> { at, value }
  var pending = {}; // id -> the request already asking for it

  // Only plain hex colors ever reach a style, whatever the server sends.
  function hex(c) { return typeof c === 'string' && HEX.test(c) ? c : null; }

  function ask(ids) {
    return fetch(SUPA_URL + '/rest/v1/rpc/gv_public_cosmetics', {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_ids: ids })
    }).then(function (r) {
      return r.ok ? r.json() : Promise.reject(new Error('gv_public_cosmetics ' + r.status));
    }).then(function (found) {
      ids.forEach(function (id) {
        cache[id] = { at: Date.now(), value: (found && found[id]) || null };
      });
    }).catch(function (err) {
      // Names still show, just plain. Not cached, so the next load tries again.
      console.warn('Could not load cosmetics', err);
    }).then(function () {
      ids.forEach(function (id) { delete pending[id]; });
    });
  }

  // Always resolves: a failed request leaves those players out of the map.
  function load(userIds) {
    var ids = [];
    (userIds || []).forEach(function (id) {
      if (typeof id !== 'string' || !UUID.test(id)) return;
      id = id.toLowerCase();
      if (ids.indexOf(id) === -1) ids.push(id);
    });

    var now = Date.now();
    var fresh = ids.filter(function (id) {
      var hit = cache[id];
      return !pending[id] && !(hit && now - hit.at < TTL);
    });
    for (var i = 0; i < fresh.length; i += BATCH) {
      var part = fresh.slice(i, i + BATCH);
      var req = ask(part);
      part.forEach(function (id) { pending[id] = req; });
    }

    var waits = ids.map(function (id) { return pending[id]; }).filter(Boolean);
    return Promise.all(waits).then(function () {
      var out = {};
      ids.forEach(function (id) {
        if (cache[id] && cache[id].value) out[id] = cache[id].value;
      });
      return out;
    });
  }

  function forget(userId) {
    if (typeof userId === 'string') delete cache[userId.toLowerCase()];
  }

  window.GV = window.GV || {};
  window.GV.cosmetics = {
    load: load,
    forget: forget
  };
})();

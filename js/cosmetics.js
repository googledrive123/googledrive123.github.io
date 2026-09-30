/* GameVault cosmetics.
   What players wear from the shop (/shop/): a name color, a ring around the
   avatar and a title. They only change how a name looks. Any page can show
   them, signed in or not: this fetches the public gv_public_cosmetics
   function (shop/shop.sql) with the site's anon key and needs nothing else.

   Public surface: window.GV.cosmetics
     load(userIds)              -> Promise<{ [userId]: cosmetics }>
     forget(userId)             drops a cached entry, e.g. after equipping
     applyName(el, cosmetics)   colors the element's text
     applyAvatar(el, cosmetics) rings the element (it should be round already)
     applyTitle(el, cosmetics)  puts the title in el, hides el when there is none

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

  // Call it on an element that holds only the name: a gradient color reaches
  // everything inside, badges included.
  function applyName(el, cosmetics) {
    if (!el) return;
    var s = el.style;
    if (el.dataset.gvName) {
      s.color = s.backgroundImage = s.webkitBackgroundClip = s.backgroundClip = s.webkitTextFillColor = '';
      delete el.dataset.gvName;
    }
    var item = cosmetics && cosmetics.name_color;
    var v = item && item.value;
    if (!v) return;
    var stops = Array.isArray(v.gradient) ? v.gradient.map(hex).filter(Boolean) : [];
    var solid = hex(v.color) || stops[0];
    if (!solid) return;
    s.color = solid; // also what an underline or a copied name falls back to
    if (stops.length > 1) {
      s.backgroundImage = 'linear-gradient(90deg, ' + stops.join(', ') + ')';
      s.webkitBackgroundClip = s.backgroundClip = 'text';
      s.webkitTextFillColor = 'transparent';
    }
    el.dataset.gvName = item.id || 'on';
  }

  // Rings are box-shadows, so they take no room and cannot shift a layout.
  // Small avatars get thinner rings so a 22px one is still mostly face.
  function applyAvatar(el, cosmetics) {
    if (!el) return;
    if (el.dataset.gvFrame) {
      el.style.boxShadow = '';
      delete el.dataset.gvFrame;
    }
    var item = cosmetics && cosmetics.avatar_frame;
    var v = item && item.value;
    if (!v) return;
    var ring = (Array.isArray(v.ring) ? v.ring : []).map(hex).filter(Boolean).slice(0, 4);
    var glow = hex(v.glow);
    if (!ring.length && !glow) return;
    var size = el.offsetWidth || 32;
    var step = size < 30 ? 1.5 : size < 56 ? 2 : 3;
    var shadows = ring.map(function (c, i) { return '0 0 0 ' + step * (i + 1) + 'px ' + c; });
    if (glow) shadows.push('0 0 ' + (step * ring.length + 10) + 'px ' + glow);
    el.style.boxShadow = shadows.join(', ');
    el.dataset.gvFrame = item.id || 'on';
  }

  function applyTitle(el, cosmetics) {
    if (!el) return;
    var item = cosmetics && cosmetics.title;
    var text = item && item.value && typeof item.value.text === 'string' ? item.value.text : (item && item.name) || '';
    el.textContent = text;
    el.hidden = !text;
  }

  window.GV = window.GV || {};
  window.GV.cosmetics = {
    load: load,
    forget: forget,
    applyName: applyName,
    applyAvatar: applyAvatar,
    applyTitle: applyTitle
  };
})();

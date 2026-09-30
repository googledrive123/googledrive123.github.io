/*
 * GameVault save backup
 * ---------------------
 * Most games here keep their progress in this site's own storage: the
 * localStorage and IndexedDB of googledrive123.github.io. So one file can
 * carry every one of those games to another browser, or bring them back after
 * the history was cleared.
 *
 * collect() packs all of it into plain JSON and restore() puts a file back.
 * A signed-in player can also keep three named copies and one daily automatic
 * copy on their account: the gv_saves table and the private 'saves' bucket,
 * set up in /saves/saves.sql.
 *
 * Left out on purpose: this browser's sign-in and settings, which belong to
 * it and not to a game, and PolyTrack, which syncs its own save with the
 * account. skipKey has the list.
 *
 * Public surface: window.GV.saves.
 */
(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';
  var SUPA_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  var AUTH_KEY = 'sb-dxwjxzmlezfyursysays-auth-token';
  var BUCKET = 'saves';
  var MAX_BYTES = 45 * 1024 * 1024;   // the bucket's own limit, see saves.sql
  var DAY = 24 * 60 * 60 * 1000;
  var AUTO_KEY = 'gv.saves.auto';
  var AUTO_AT_KEY = 'gv.saves.autoAt';

  // Engine caches and GameVault's own identity store: big, rebuilt on their
  // own, and nothing a player would miss.
  var SKIP_DBS = ['gamevault', 'UnityCache', 'EM_PRELOAD_CACHE', 'firebaseLocalStorageDb'];

  /* A save file carries game progress, never how this browser is set up, so
     a restore neither writes nor deletes any of these: the sign-in (every
     sb- key), the visitor ids and dashboard secret, the tab disguise and
     panic key, the site's settings and seen-it flags, and gv.saves.*, this
     browser's own record of what it backed up and when. PolyTrack syncs its
     save with the account, so it stays out too. gv.math is progress and
     stays in. */
  var SKIP_KEYS = ['gv.analytics.secret', 'gv.vid', 'gv.anon',
    'panicKey', 'panicRedirectUrl', 'panicEnabled', 'verificationEnabled',
    'gv.noanalytics', 'gv.proxy', 'gv.username', 'gv.starred.for', 'gv.theme',
    'gv.skipwelcome', 'gv.tilesize', 'gv.source', 'gv.oldhost', 'gv.carried',
    'gv.intro.seen', 'gv.broadcasts.seen', 'gv.arrival', 'gv.avatar', 'gv.watch'];
  var SKIP_PREFIXES = ['sb-', 'gv.cloak.', 'gv.hide.', 'gv.fun.', 'gv.saves.', 'polytrack_v5_prod_'];

  function skipKey(key) {
    return SKIP_KEYS.indexOf(key) !== -1 || SKIP_PREFIXES.some(function (p) {
      return key.indexOf(p) === 0;
    });
  }

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
  }

  function toBase64(bytes) {
    var parts = [];
    for (var i = 0; i < bytes.length; i += 0x8000) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
    }
    return btoa(parts.join(''));
  }

  function fromBase64(text) {
    var raw = atob(text);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  var VIEWS = ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
    'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array',
    'BigUint64Array', 'DataView'];

  function kindOf(v) { return Object.prototype.toString.call(v).slice(8, -1); }

  /* IndexedDB keeps things JSON cannot: bytes, dates, undefined, NaN. Each of
     those is written as {"$gv": kind, ...} instead. A game's own object that
     happens to have a "$gv" key is wrapped, so it is never taken for one.
     A Blob can only be read asynchronously, so it is left as a placeholder
     and queued in blobs for fillBlobs to finish. */
  function encode(v, blobs) {
    if (v === undefined) return { $gv: 'undefined' };
    if (typeof v === 'number') return isFinite(v) ? v : { $gv: 'number', value: String(v) };
    if (typeof v === 'bigint') return { $gv: 'bigint', value: v.toString() };
    if (v === null || typeof v !== 'object') return v;

    var kind = kindOf(v);
    if (kind === 'Date') return { $gv: 'date', value: v.getTime() };
    if (kind === 'ArrayBuffer') return { $gv: 'bytes', data: toBase64(new Uint8Array(v)) };
    if (ArrayBuffer.isView(v)) {
      return { $gv: 'bytes', view: kind, data: toBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    }
    if (kind === 'Blob' || kind === 'File') {
      var slot = { $gv: 'blob', type: v.type, data: '' };
      if (kind === 'File') { slot.name = v.name; slot.lastModified = v.lastModified; }
      blobs.push([slot, v]);
      return slot;
    }
    if (kind === 'Map') {
      var entries = [];
      v.forEach(function (value, key) { entries.push([encode(key, blobs), encode(value, blobs)]); });
      return { $gv: 'map', entries: entries };
    }
    if (kind === 'Set') {
      var values = [];
      v.forEach(function (value) { values.push(encode(value, blobs)); });
      return { $gv: 'set', values: values };
    }
    if (kind === 'RegExp') return { $gv: 'regexp', source: v.source, flags: v.flags };
    if (Array.isArray(v)) return v.map(function (item) { return encode(item, blobs); });

    var out = {};
    Object.keys(v).forEach(function (key) { out[key] = encode(v[key], blobs); });
    return Object.prototype.hasOwnProperty.call(v, '$gv') ? { $gv: 'object', value: out } : out;
  }

  function fillBlobs(blobs) {
    return Promise.all(blobs.map(function (pair) {
      return new Response(pair[1]).arrayBuffer().then(function (buffer) {
        pair[0].data = toBase64(new Uint8Array(buffer));
      });
    }));
  }

  function decodeObject(v) {
    var out = {};
    Object.keys(v).forEach(function (key) { out[key] = decode(v[key]); });
    return out;
  }

  function decode(v) {
    if (Array.isArray(v)) return v.map(decode);
    if (v === null || typeof v !== 'object') return v;
    if (!Object.prototype.hasOwnProperty.call(v, '$gv')) return decodeObject(v);

    switch (v.$gv) {
      case 'object': return decodeObject(v.value);
      case 'undefined': return undefined;
      case 'number': return Number(v.value);
      case 'bigint': return BigInt(v.value);
      case 'date': return new Date(v.value);
      case 'regexp': return new RegExp(v.source, v.flags);
      case 'set': return new Set(v.values.map(decode));
      case 'map':
        return new Map(v.entries.map(function (e) { return [decode(e[0]), decode(e[1])]; }));
      case 'bytes': {
        var bytes = fromBase64(v.data);
        if (!v.view) return bytes.buffer;
        if (VIEWS.indexOf(v.view) === -1) return bytes;
        return new window[v.view](bytes.buffer);
      }
      case 'blob': {
        var parts = [fromBase64(v.data)];
        if (typeof v.name === 'string') {
          return new File(parts, v.name, { type: v.type, lastModified: v.lastModified });
        }
        return new Blob(parts, { type: v.type });
      }
    }
    return decodeObject(v);
  }

  function done(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* Every database on this origin except the skipped ones. A browser with no
     way to list them (Firefox before 126) backs up localStorage alone. */
  function listDbs() {
    if (!window.indexedDB || typeof indexedDB.databases !== 'function') return Promise.resolve([]);
    return indexedDB.databases().then(function (list) {
      return list.map(function (d) { return d.name; }).filter(function (name) {
        return name && SKIP_DBS.indexOf(name) === -1;
      });
    }, function () { return []; });
  }

  /* Opening without a version never changes an existing database. If it has
     gone since it was listed, the open would make an empty one, so that is
     cancelled and the database skipped. */
  function openExisting(name) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(name);
      var created = false;
      req.onupgradeneeded = function () { created = true; req.transaction.abort(); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () {
        if (created) { resolve(null); return; }
        reject(req.error);
      };
    });
  }

  function dumpDb(name) {
    return openExisting(name).then(function (db) {
      if (!db) return null;
      var out = { version: db.version, stores: {} };
      var names = Array.prototype.slice.call(db.objectStoreNames);
      if (!names.length) { db.close(); return out; }

      var blobs = [];
      var tx = db.transaction(names, 'readonly');
      return Promise.all(names.map(function (storeName) {
        var store = tx.objectStore(storeName);
        // Read now: the store's details are gone once the transaction ends.
        var entry = {
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement,
          indexes: Array.prototype.map.call(store.indexNames, function (indexName) {
            var index = store.index(indexName);
            return { name: index.name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
          }),
          records: []
        };
        out.stores[storeName] = entry;
        return Promise.all([done(store.getAllKeys()), done(store.getAll())]).then(function (r) {
          entry.records = r[0].map(function (key, i) {
            return [encode(key, blobs), encode(r[1][i], blobs)];
          });
        });
      })).then(function () {
        db.close();
        return fillBlobs(blobs);
      }, function (err) {
        db.close();
        throw err;
      }).then(function () { return out; });
    });
  }

  function localKeys() {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key !== null && !skipKey(key)) keys.push(key);
      }
    } catch (e) {}
    return keys;
  }

  // One database at a time, so a browser full of games is not all in memory twice.
  function eachInTurn(items, fn) {
    return items.reduce(function (chain, item) {
      return chain.then(function () { return fn(item); });
    }, Promise.resolve());
  }

  function collect() {
    var data = {
      v: 1,
      made: new Date().toISOString(),
      origin: location.origin,
      localStorage: {},
      indexedDB: {}
    };
    localKeys().forEach(function (key) { data.localStorage[key] = read(key); });
    return listDbs().then(function (names) {
      return eachInTurn(names, function (name) {
        return dumpDb(name).then(function (dump) { if (dump) data.indexedDB[name] = dump; });
      });
    }).then(function () { return data; });
  }

  // Another tab would not let go of this database. restore() tells this
  // apart from any other failure by .held.
  function heldError(name) {
    var err = new Error('A game open in another tab is using its save (' + name + ').');
    err.held = name;
    return err;
  }

  /* A game open in another tab holds its database, and the delete waits
     until that tab lets go. Waiting forever looks like a hang, so after a few
     seconds the player is told what is in the way. */
  function deleteDb(name) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.deleteDatabase(name);
      var timer = null;
      req.onsuccess = function () { clearTimeout(timer); resolve(); };
      req.onerror = function () { clearTimeout(timer); reject(req.error); };
      req.onblocked = function () {
        timer = setTimeout(function () { reject(heldError(name)); }, 4000);
      };
    });
  }

  function isInline(keyPath) { return keyPath !== null && keyPath !== undefined; }

  function createDb(name, dump) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(name, Math.max(1, dump.version || 1));
      req.onupgradeneeded = function () {
        var db = req.result;
        Object.keys(dump.stores || {}).forEach(function (storeName) {
          var s = dump.stores[storeName];
          var options = { autoIncrement: !!s.autoIncrement };
          if (isInline(s.keyPath)) options.keyPath = s.keyPath;
          var store = db.createObjectStore(storeName, options);
          (s.indexes || []).forEach(function (i) {
            store.createIndex(i.name, i.keyPath, { unique: !!i.unique, multiEntry: !!i.multiEntry });
          });
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function fillDb(db, dump) {
    var names = Object.keys(dump.stores || {});
    if (!names.length) { db.close(); return Promise.resolve(); }
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(names, 'readwrite');
      tx.oncomplete = function () { db.close(); resolve(); };
      tx.onabort = function () { db.close(); reject(tx.error || new Error('A game database could not be written.')); };
      // A record put() refuses outright would otherwise leave half a database.
      try {
        names.forEach(function (storeName) {
          var s = dump.stores[storeName];
          var store = tx.objectStore(storeName);
          var inline = isInline(s.keyPath);
          (s.records || []).forEach(function (r) {
            if (inline) store.put(decode(r[1]));
            else store.put(decode(r[1]), decode(r[0]));
          });
        });
      } catch (err) {
        reject(err);
        tx.abort();
      }
    });
  }

  function rebuildDb(name, dump) {
    return deleteDb(name).then(function () { return createDb(name, dump); })
      .then(function (db) { return fillDb(db, dump); });
  }

  // Keys the file does not have go too: a restore puts the browser back to
  // exactly the moment the file was made, not a mix of then and now.
  function restoreLocal(saved) {
    localKeys().forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(saved, key)) localStorage.removeItem(key);
    });
    Object.keys(saved).forEach(function (key) {
      if (!skipKey(key) && typeof saved[key] === 'string') localStorage.setItem(key, saved[key]);
    });
  }

  function isSave(data) {
    return !!data && data.v === 1
      && typeof data.localStorage === 'object' && data.localStorage !== null
      && typeof data.indexedDB === 'object' && data.indexedDB !== null;
  }

  /* Would a game open in another tab hold up deleting or replacing this
     database? Asks for the upgrade a rebuild needs and aborts it in
     onupgradeneeded, which leaves the database exactly as it was. A tab that
     will not let go keeps the request waiting (onblocked), so after a few
     seconds without an answer the database counts as held. The request left
     waiting aborts the same way whenever that tab closes. */
  function checkFree(name) {
    return new Promise(function (resolve, reject) {
      var gaveUp = false;
      var timer = setTimeout(function () {
        gaveUp = true;
        reject(new Error('A game open in another tab is using its save (' + name + '), so nothing was '
          + 'restored and nothing changed. Close every other GameVault tab, then restore again.'));
      }, 4000);
      function settle(fn, value) { clearTimeout(timer); fn(value); }
      openExisting(name).then(function (db) {
        if (!db) { settle(resolve); return; }
        var version = db.version;
        db.close();
        if (gaveUp) return;
        var req = indexedDB.open(name, version + 1);
        req.onupgradeneeded = function () { req.transaction.abort(); };
        req.onsuccess = function () { req.result.close(); settle(resolve); };
        req.onerror = function () { settle(resolve); };
      }, function (err) { settle(reject, err); });
    });
  }

  /* Databases first: they are the step that can be refused, by another tab
     holding one open, so every one the restore deletes or replaces is checked
     before any is touched. A tab can still take one back in the meantime,
     and then the player has to know the restore is half done. localStorage
     is only touched once the databases are all in. The caller reloads
     afterwards, so no game keeps running on the old progress. */
  function restore(data) {
    if (!isSave(data)) return Promise.reject(new Error('That is not a GameVault save file.'));
    var incoming = Object.keys(data.indexedDB).filter(function (name) {
      return SKIP_DBS.indexOf(name) === -1;
    });
    var gone = [];
    return listDbs().then(function (here) {
      gone = here.filter(function (name) { return incoming.indexOf(name) === -1; });
      return eachInTurn(gone.concat(incoming), checkFree);
    }).then(function () {
      return eachInTurn(gone, deleteDb).then(function () {
        return eachInTurn(incoming, function (name) { return rebuildDb(name, data.indexedDB[name]); });
      }).catch(function (err) {
        if (!err || !err.held) throw err;
        throw new Error('Part of the restore already happened, but a game in another tab took hold of '
          + 'its save (' + err.held + ') partway through. Close every other GameVault tab, then '
          + 'restore again.');
      });
    }).then(function () {
      restoreLocal(data.localStorage);
    });
  }

  function parse(text) {
    var data = null;
    try { data = JSON.parse(text); } catch (e) {}
    if (!isSave(data)) throw new Error('That is not a GameVault save file.');
    return data;
  }

  function readFile(file) {
    return new Response(file).text().then(parse);
  }

  function today() {
    var d = new Date();
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
  }

  function download() {
    return collect().then(function (data) {
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'gamevault-save-' + today() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      return blob.size;
    });
  }

  /* A page that already has a Supabase client hands it over with useClient,
     so there is one client per page: two would both try to refresh the same
     session. Anywhere else one is made from the stored sign-in. */
  var client = null;
  var clientReady = null;

  function useClient(existing) {
    if (existing) client = existing;
  }

  function loadLibrary() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SUPA_JS;
      s.onload = function () { resolve(window.supabase); };
      s.onerror = function () { reject(new Error('Could not reach the save server. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
  }

  function getClient() {
    if (client) return Promise.resolve(client);
    if (!clientReady) {
      clientReady = loadLibrary().then(function (lib) {
        if (!client) client = lib.createClient(SUPA_URL, SUPA_KEY);
        return client;
      }, function (err) {
        clientReady = null;
        throw err;
      });
    }
    return clientReady;
  }

  // Cheap enough to ask on every page: no library, no network.
  function hasSession() {
    try {
      var s = JSON.parse(read(AUTH_KEY) || 'null');
      return !!(s && s.access_token);
    } catch (e) { return false; }
  }

  function cloudUser() {
    if (!hasSession()) return Promise.resolve(null);
    return getClient().then(function (c) { return c.auth.getSession(); }).then(function (r) {
      return (r.data && r.data.session && r.data.session.user) || null;
    });
  }

  function friendly(err) {
    var text = String((err && (err.message || err.error)) || err || '');
    if (String(err && err.statusCode) === '413' || /maximum allowed size|payload too large/i.test(text)) {
      return new Error('That save is over the 45 MB a cloud slot holds. Download it as a file instead.');
    }
    if (/failed to fetch|networkerror|load failed/i.test(text)) {
      return new Error('Could not reach the save server. Check your connection and try again.');
    }
    return err instanceof Error ? err : new Error(text || 'Something went wrong. Try again.');
  }

  function check(r) {
    if (r.error) throw friendly(r.error);
    return r.data;
  }

  function withUser(fn) {
    return Promise.all([getClient(), cloudUser()]).then(function (both) {
      if (!both[1]) throw new Error('Sign in on the home page to use cloud slots.');
      return fn(both[0], both[1]);
    });
  }

  function filePath(user, slot) { return user.id + '/' + slot + '.json'; }

  var COLUMNS = 'slot,title,size_bytes,updated_at';

  function cloudList() {
    return withUser(function (c) {
      return c.from('gv_saves').select(COLUMNS).order('slot').then(check);
    });
  }

  function cleanTitle(title) {
    return String(title || '').replace(/\s+/g, ' ').trim().slice(0, 40) || null;
  }

  function mb(bytes) { return (bytes / (1024 * 1024)).toFixed(1) + ' MB'; }

  /* The file goes up first and the row after, so a slot never lists a save
     that is not there. Leaving title out keeps the slot's current name.
     cacheControl 0: a slot is overwritten in place, and a cached copy of the
     old file would load yesterday's progress. */
  function cloudSave(slot, title) {
    return withUser(function (c, user) {
      return collect().then(function (data) {
        var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        if (blob.size > MAX_BYTES) {
          throw new Error('This save is ' + mb(blob.size) + ', over the 45 MB a cloud slot holds. '
            + 'Download it as a file instead.');
        }
        return c.storage.from(BUCKET)
          .upload(filePath(user, slot), blob, { upsert: true, contentType: 'application/json', cacheControl: '0' })
          .then(check)
          .then(function () {
            var row = { user_id: user.id, slot: slot, size_bytes: blob.size, updated_at: new Date().toISOString() };
            if (title !== undefined) row.title = cleanTitle(title);
            return c.from('gv_saves').upsert(row).select(COLUMNS).single().then(check);
          });
      });
    });
  }

  // Loading the auto slot counts as this browser's latest auto-save: what it
  // holds now is exactly that copy.
  function cloudLoad(slot) {
    return withUser(function (c, user) {
      return c.storage.from(BUCKET).download(filePath(user, slot)).then(check)
        .then(function (blob) { return new Response(blob).text(); })
        .then(parse)
        .then(restore)
        .then(function () {
          if (slot === 'auto') write(AUTO_AT_KEY, new Date().toISOString());
        });
    });
  }

  function cloudRename(slot, title) {
    return withUser(function (c, user) {
      return c.from('gv_saves').update({ title: cleanTitle(title) })
        .eq('user_id', user.id).eq('slot', slot)
        .select(COLUMNS).single().then(check);
    });
  }

  // File first, then the row: a failed delete leaves the slot listed and
  // still loadable rather than a row pointing at nothing.
  function cloudDelete(slot) {
    return withUser(function (c, user) {
      return c.storage.from(BUCKET).remove([filePath(user, slot)]).then(check)
        .then(function () {
          return c.from('gv_saves').delete().eq('user_id', user.id).eq('slot', slot).then(check);
        });
    });
  }

  function autoOn() { return read(AUTO_KEY) === '1'; }
  function setAuto(on) { write(AUTO_KEY, on ? '1' : null); }
  function autoAt() { return read(AUTO_AT_KEY); }

  function whenIdle() {
    return new Promise(function (resolve) {
      if (window.requestIdleCallback) requestIdleCallback(function () { resolve(); }, { timeout: 5000 });
      else setTimeout(resolve, 1500);
    });
  }

  /* Once a day, quietly, for a signed-in player who turned it on in this
     browser. A browser that has never auto-saved may be a fresh one without
     the progress the account's auto slot holds, so it leaves that slot alone
     until /saves/ has offered to load it (autoOffer below). Resolves true
     only when it saved; never rejects, since nobody is watching. */
  var autoRunning = false;

  function autoSaveIfDue(existing) {
    useClient(existing);
    var last = Date.parse(autoAt() || '');
    if (autoRunning || !autoOn() || !hasSession()) return Promise.resolve(false);
    if (last && Date.now() - last < DAY) return Promise.resolve(false);

    autoRunning = true;
    return whenIdle().then(function () {
      return withUser(function (c) {
        var guard = last ? Promise.resolve(null)
          : c.from('gv_saves').select('slot').eq('slot', 'auto').maybeSingle().then(check);
        return guard.then(function (existingAuto) {
          if (existingAuto) return false;
          return cloudSave('auto').then(function (row) {
            write(AUTO_AT_KEY, row.updated_at);
            return true;
          });
        });
      });
    }).catch(function () { return false; }).then(function (saved) {
      autoRunning = false;
      return saved;
    });
  }

  /* The account's auto slot, if this browser has never auto-saved or loaded
     one: /saves/ asks whether to load it. Turning the offer down counts that
     copy as this browser's last auto-save, so the next one replaces it a day
     after it was made. A caller that already listed the slots passes them in
     rather than asking the server twice. */
  function autoOffer(rows) {
    if (autoAt()) return Promise.resolve(null);
    return (rows ? Promise.resolve(rows) : cloudList()).then(function (list) {
      return list.filter(function (r) { return r.slot === 'auto'; })[0] || null;
    });
  }

  function dismissAutoOffer(row) {
    write(AUTO_AT_KEY, (row && row.updated_at) || new Date().toISOString());
  }

  window.GV = window.GV || {};
  window.GV.saves = {
    MAX_BYTES: MAX_BYTES,
    collect: collect,
    restore: restore,
    download: download,
    readFile: readFile,
    useClient: useClient,
    client: getClient,
    cloudUser: cloudUser,
    cloudList: cloudList,
    cloudSave: cloudSave,
    cloudLoad: cloudLoad,
    cloudRename: cloudRename,
    cloudDelete: cloudDelete,
    autoOn: autoOn,
    setAuto: setAuto,
    autoAt: autoAt,
    autoSaveIfDue: autoSaveIfDue,
    autoOffer: autoOffer,
    dismissAutoOffer: dismissAutoOffer
  };
})();

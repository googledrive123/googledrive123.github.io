/* GameVault save carry-over, shared by index.html and /404.html.
   A game that moved from /games/<id>/ to a vault is at a new address, and some
   engines file saves under the address. Unity keeps them in the "/idbfs"
   database under an MD5 of the page's folder URL; Ruffle names its
   localStorage keys after the SWF's path. Copying them across once, before the
   game starts, means nobody starts over. Nothing old is deleted.
   Public surface: window.GV.carry(game) -> Promise, resolves within 1.5 s. */
(function () {
  'use strict';
  // MD5 of a string's UTF-8 bytes, as lowercase hex.
  function md5(str) {
    const bytes = new TextEncoder().encode(str);
    const n = ((bytes.length + 8) >> 6) + 1;
    const w = new Uint32Array(n * 16);
    for (let i = 0; i < bytes.length; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
    w[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
    w[n * 16 - 2] = bytes.length * 8;
    const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let o = 0; o < w.length; o += 16) {
      let a = a0, b = b0, c = c0, d = d0;
      for (let i = 0; i < 64; i++) {
        let f, g;
        if (i < 16) { f = (b & c) | (~b & d); g = i; }
        else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
        else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
        else { f = c ^ (b | ~d); g = (7 * i) % 16; }
        const t = d; d = c; c = b;
        const x = (a + f + K[i] + w[o + g]) >>> 0;
        const s = S[(i >> 4) * 4 + (i % 4)];
        b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0;
        a = t;
      }
      a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
    }
    return [a0, b0, c0, d0].map(v => Array.from({ length: 4 }, (_, i) => ((v >>> (i * 8)) & 255).toString(16).padStart(2, '0')).join('')).join('');
  }

  // Copies Unity's save folder for one page folder URL to another, skipping any
  // file the new folder already has.
  function carryUnity(oldDir, newDir) {
    return new Promise(resolve => {
      let req;
      try { req = indexedDB.open('/idbfs'); } catch (e) { return resolve(); }
      // No database yet means no Unity game ever saved here. Do not create one.
      req.onupgradeneeded = () => req.transaction.abort();
      req.onerror = () => resolve();
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('FILE_DATA')) { db.close(); return resolve(); }
        const from = '/idbfs/' + md5(oldDir), to = '/idbfs/' + md5(newDir);
        const tx = db.transaction('FILE_DATA', 'readwrite');
        const store = tx.objectStore('FILE_DATA');
        store.openCursor(IDBKeyRange.bound(from, from + '\uffff')).onsuccess = (e) => {
          const c = e.target.result;
          if (!c) return;
          const add = store.add(c.value, to + String(c.key).slice(from.length));
          add.onerror = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
          c.continue();
        };
        tx.oncomplete = tx.onabort = () => { db.close(); resolve(); };
      };
    });
  }

  // Copies localStorage keys that name the old folder (Ruffle's saves do) to
  // the same keys naming the new one.
  function carryKeys(oldPath, newPath) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(oldPath) === -1) continue;
        const nk = k.split(oldPath).join(newPath);
        if (localStorage.getItem(nk) === null) localStorage.setItem(nk, localStorage.getItem(k));
      }
    } catch (e) {}
  }

  // Once per game per browser. Gives up after a moment rather than hold the game.
  const CARRIED_KEY = 'gv.carried';
  function carrySaves(g) {
    let done;
    try { done = new Set(JSON.parse(localStorage.getItem(CARRIED_KEY) || '[]')); }
    catch (e) { done = new Set(); }
    if (!g || !g.site || done.has(g.id)) return Promise.resolve();
    // Flash games share one folder and name the SWF in `path`.
    const dir = (g.path || g.id + '/').split(/[\/?]/)[0];
    const oldPath = '/games/' + dir + '/', newPath = '/vault' + g.site + '/' + dir + '/';
    carryKeys(oldPath, newPath);
    // Some games run their Unity build from a page in a subfolder (Duck Life
    // opens unity/index.html), and Unity hashes that folder instead.
    const subs = ['', '/unity', '/game', '/webgl', '/html5'];
    const unity = subs.reduce((p, sub) => p.then(() => carryUnity(
      location.origin + oldPath.slice(0, -1) + sub, location.origin + newPath.slice(0, -1) + sub)), Promise.resolve());
    const work = unity.then(() => {
      done.add(g.id);
      try { localStorage.setItem(CARRIED_KEY, JSON.stringify([...done])); } catch (e) {}
    });
    return Promise.race([work, new Promise(r => setTimeout(r, 1500))]);
  }

  window.GV = window.GV || {};
  window.GV.carry = carrySaves;
})();

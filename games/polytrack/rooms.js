// Multiplayer rooms for PolyTrack.
//
// PolyTrack 0.6.3 already ships multiplayer: the menu has a tile for it, and
// the bundle carries a host panel, a join-by-code panel, invite codes, car
// sync and reconnect handling. None of it works here, because the signalling
// server it dials is vps.kodub.com, which only answers official builds.
//
// So this file gives that existing multiplayer a signalling server of its own,
// backed by the site's Supabase. Rooms, codes and the connection handshake go
// through Supabase; once two players are introduced, the race itself runs
// browser to browser over WebRTC and touches no server at all.
//
// Like leaderboard.js, it stands in front of a browser API rather than editing
// main.bundle.js, so the bundle stays byte-for-byte what Kodub shipped. There
// it was XMLHttpRequest; here it is WebSocket. Anything not addressed to
// vps.kodub.com is handed to the real WebSocket untouched.
//
// Loaded before main.bundle.js in index.html. Must stay before it: the game
// captures WebSocket when its own module initialises.

// ── The protocol, as the bundle validates it ──────────────────────────────
//
// Transcribed from main.bundle.js rather than guessed. Every field below is
// checked on arrival, and any mismatch makes the game log
// "Host WebSocket message error: <field>" (or "Join WebSocket message error:")
// and close the socket. Getting a field name or a type wrong does not
// degrade, it disconnects, so this list is the specification.
//
// Two sockets, told apart by path, not by any field:
//   https://vps.kodub.com/v6/multiplayer/host
//   https://vps.kodub.com/v6/multiplayer/join
//
// HOST SOCKET
//
//   Game sends:
//     { version: "0.6.3", type: "createInvite", key: string, nickname?: string }
//     { version: "0.6.3", type: "acceptJoin", session: string, answer: string,
//       mods: [], isModsVanillaCompatible: true, clientId: number }
//     { version: "0.6.3", type: "declineJoin", session: string, reason: string }
//       reason is one of "MalformedClientData", "IncompatibleMods",
//       "SessionFull", "WebRTCError", "Kicked"
//     { version: "0.6.3", type: "iceCandidate", session: string, candidate: object }
//
//   Game expects:
//     { type: "createInvite", inviteCode: string, key: string,
//       timeoutMilliseconds: number, censoredNickname: string }
//     { type: "joinInvite", session: string, offer: string, version: string,
//       mods: string[], isModsVanillaCompatible: boolean, nickname: string,
//       countryCode: string, carStyle: string, iceServers: IceServer[] }
//     { type: "iceCandidate", session: string, candidate: object }
//     { type: "joinDisconnect", session: string }
//     { type: "error", error: string }
//
// JOIN SOCKET
//
//   Game sends (note: no type field on either, the path is the context):
//     { version: "0.6.3", inviteCode: string, offer: string, mods: [],
//       isModsVanillaCompatible: true, nickname: string, countryCode: string,
//       carStyle: string }
//     { version: "0.6.3", candidate: object }
//
//   Game expects:
//     { type: "acceptJoin", answer: string, version: string, mods: string[],
//       isModsVanillaCompatible: boolean, clientId: number }
//     { type: "declineJoin", reason: string }
//     { type: "iceCandidate", candidate: object }
//     { type: "error", error: string }
//
// IceServer, as validated inside joinInvite:
//   { urls: string | string[], username?: string, credential?: string }
//
// Details that are easy to get wrong:
//   - version is split on "-" and the first part must exist. The bundle also
//     records whether that part is "0.6.0" to pick a compatibility path.
//   - mods is an array of strings, not of objects. The game always sends an
//     empty one and always claims vanilla compatibility, so the mod
//     declaration in index.html does not lock anyone out of a room.
//   - clientId is a number. A numeric string closes the socket.
//   - candidate is an object, and null is not accepted in its place even
//     though the bundle handles a null candidate once it is past validation.
//   - The host socket arms a 35 second inactivity timer that resets on any
//     inbound message, so an idle room needs traffic to stay open.
//   - iceServers arrives on the host through joinInvite, so the list has to be
//     supplied per join, not only through the iceServers endpoint.

(function () {
  'use strict';

  var SUPA_URL = 'https://dxwjxzmlezfyursysays.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2p4em1sZXpmeXVyc3lzYXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTM1MzAsImV4cCI6MjA5NDI4OTUzMH0.BQZdvlRD1ykfSV0bhlxt77Nb90DzvcX4NI2LrMK4n_0';

  var NativeWebSocket = window.WebSocket;

  // ── Talking to Supabase ───────────────────────────────────────
  // Same shape as the helper in leaderboard.js: a plain fetch at PostgREST,
  // anon key only. Rooms belong to whoever is holding the host key, not to a
  // signed-in account, so there is no session to attach here.

  function rpc(name, body) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY
      },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          throw new Error('rpc ' + name + ' failed: ' + res.status + ' ' + text);
        });
      }
      return res.json();
    });
  }

  // ── ICE servers ──────────────────────────────────────────────
  // WebRTC will not attempt a connection without these. The list is served by
  // Supabase rather than written here, because a TURN relay comes with
  // credentials and this repository is public. Fetched once per page.
  //
  // The fallback is public STUN, which is enough on an ordinary home network
  // and not enough on one that blocks direct traffic. Losing the list
  // entirely should still leave most players able to race.

  var STUN_ONLY = [{ urls: ['stun:stun.l.google.com:19302'] }];
  var ice = null;

  function iceServers() {
    if (ice !== null) return ice;
    ice = rpc('polytrack_ice_servers', {})
      .then(function (list) {
        return Array.isArray(list) && list.length > 0 ? list : STUN_ONLY;
      })
      .catch(function (error) {
        console.error('Falling back to public STUN:', error);
        return STUN_ONLY;
      });
    return ice;
  }

  // ── The realtime client ────────────────────────────────────
  // Signalling needs a channel both players are listening on, which means the
  // supabase-js SDK. The game's page does not load it, and most visits never
  // open a room, so it is fetched the first time a room is actually created or
  // joined rather than on every page load. Same pinned CDN build the site's
  // own index.html uses.

  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  var sdk = null;
  var client = null;

  function loadSdk() {
    if (sdk !== null) return sdk;
    sdk = new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) {
        resolve(window.supabase);
        return;
      }
      var tag = document.createElement('script');
      tag.src = SDK_URL;
      tag.onload = function () {
        if (window.supabase && window.supabase.createClient) resolve(window.supabase);
        else reject(new Error('supabase-js loaded without createClient'));
      };
      tag.onerror = function () {
        reject(new Error('could not load supabase-js'));
      };
      document.head.appendChild(tag);
    });
    return sdk;
  }

  // One client for the page. Sessions are deliberately not persisted: this
  // client exists for realtime only, and writing auth state would tread on the
  // session the site established, which leaderboard.js and account.js read.
  function realtime() {
    if (client !== null) return client;
    client = loadSdk().then(function (lib) {
      return lib.createClient(SUPA_URL, SUPA_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 20 } }
      });
    });
    return client;
  }

  // ── Sockets ───────────────────────────────────────────────

  // A socket that is never dialled. The game holds it, listens on it and
  // sends JSON into it exactly as it would a real one; what comes back is
  // assembled here instead of arriving off the wire. Only the surface the
  // bundle actually touches is implemented, which is the four events, send,
  // close and readyState.
  //
  // The role handler replaces send. Until one is attached the socket accepts
  // messages and drops them, so a half-wired path fails quietly rather than
  // throwing inside the game's own handler.

  function FakeWebSocket(url) {
    this.url = String(url);
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.listeners = { open: [], message: [], close: [], error: [] };
  }

  FakeWebSocket.prototype.CONNECTING = 0;
  FakeWebSocket.prototype.OPEN = 1;
  FakeWebSocket.prototype.CLOSING = 2;
  FakeWebSocket.prototype.CLOSED = 3;

  FakeWebSocket.prototype.addEventListener = function (type, fn) {
    if (this.listeners[type] && typeof fn === 'function') this.listeners[type].push(fn);
  };

  FakeWebSocket.prototype.removeEventListener = function (type, fn) {
    var list = this.listeners[type];
    if (!list) return;
    var at = list.indexOf(fn);
    if (at >= 0) list.splice(at, 1);
  };

  FakeWebSocket.prototype.emit = function (type, event) {
    var handler = this['on' + type];
    if (typeof handler === 'function') {
      try { handler.call(this, event); } catch (e) { console.error(e); }
    }
    var list = this.listeners[type].slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i].call(this, event); } catch (e) { console.error(e); }
    }
  };

  FakeWebSocket.prototype.opened = function () {
    if (this.readyState !== 0) return;
    this.readyState = 1;
    this.emit('open', { type: 'open' });
  };

  // Everything the game reads arrives as a JSON string, so callers hand over
  // the object and the stringify happens in one place.
  FakeWebSocket.prototype.deliver = function (message) {
    if (this.readyState !== 1) return;
    this.emit('message', { type: 'message', data: JSON.stringify(message) });
  };

  FakeWebSocket.prototype.send = function () {};

  FakeWebSocket.prototype.close = function () {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close', { type: 'close', code: 1000, wasClean: true });
  };

  function nativeSocket(url, protocols) {
    return protocols === undefined
      ? new NativeWebSocket(url)
      : new NativeWebSocket(url, protocols);
  }

  // Only the two multiplayer paths are ours. The game opens no other socket,
  // but the site around it might, so anything else is built as a real one.

  var MULTIPLAYER = /vps\.kodub\.com\/v\d+\/multiplayer\/(host|join)/;

  function roleOf(url) {
    var found = MULTIPLAYER.exec(String(url));
    return found === null ? null : found[1];
  }

  // ── The room channel ─────────────────────────────────────────
  // One realtime channel per room, named after the code. Everyone in the room
  // is on it, so every message carries the session it belongs to and each side
  // ignores the ones that are not its own.
  //
  // What crosses this channel is only ever an introduction: a connection
  // offer, an answer, and the network candidates the two browsers will try.
  // Once they are talking, the race runs between them and this channel has
  // nothing further to carry.

  function channelName(code) {
    return 'pt-room-' + String(code).toUpperCase();
  }

  function openChannel(code, handlers) {
    return realtime().then(function (lib) {
      return new Promise(function (resolve, reject) {
        var channel = lib.channel(channelName(code), {
          config: { broadcast: { self: false } }
        });

        Object.keys(handlers).forEach(function (event) {
          channel.on('broadcast', { event: event }, function (packet) {
            handlers[event](packet.payload || {});
          });
        });

        channel.subscribe(function (status, error) {
          if (status === 'SUBSCRIBED') resolve(channel);
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(error || new Error('room channel ' + status));
          }
        });
      });
    });
  }

  function post(channel, event, payload) {
    if (channel === null) return;
    channel.send({ type: 'broadcast', event: event, payload: payload });
  }

  // ── Roles ───────────────────────────────────────────────────
  // A role takes over the socket's send and decides what comes back. The game
  // is strict about what it accepts, so anything unrecognised is dropped
  // rather than answered with a guess: an unexpected reply closes the socket
  // and takes the room with it, while silence only stalls the one message.

  function parse(raw) {
    var message;
    try { message = JSON.parse(raw); } catch (e) { return null; }
    return message !== null && typeof message === 'object' ? message : null;
  }

  // The host's key is the secret that proves a later call belongs to the same
  // room. The game has none on its first createInvite and sends back whatever
  // it was given on every one after that, so the first call is where it is
  // minted.
  function newKey() {
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] + 256).toString(16).slice(1);
    return out;
  }

  function hostRole(socket) {
    var room = { code: null, key: null, nickname: null, channel: null };

    // A join request reaches the host as a joinInvite. The ICE list rides
    // along with it, because that is where the game reads it from when it
    // builds the peer connection for this particular player.
    function onJoin(payload) {
      if (typeof payload.session !== 'string' || typeof payload.offer !== 'string') return;
      iceServers().then(function (servers) {
        socket.deliver({
          type: 'joinInvite',
          session: payload.session,
          offer: payload.offer,
          version: typeof payload.version === 'string' ? payload.version : '0.6.3',
          mods: Array.isArray(payload.mods) ? payload.mods : [],
          isModsVanillaCompatible: payload.isModsVanillaCompatible !== false,
          nickname: typeof payload.nickname === 'string' ? payload.nickname : 'Player',
          countryCode: typeof payload.countryCode === 'string' ? payload.countryCode : '',
          carStyle: typeof payload.carStyle === 'string' ? payload.carStyle : '',
          iceServers: servers
        });
      });
    }

    function onJoinerIce(payload) {
      if (typeof payload.session !== 'string') return;
      socket.deliver({
        type: 'iceCandidate',
        session: payload.session,
        candidate: payload.candidate
      });
    }

    function onLeave(payload) {
      if (typeof payload.session !== 'string') return;
      socket.deliver({ type: 'joinDisconnect', session: payload.session });
    }

    // censoredNickname is assigned straight onto the host's player record, so
    // it cannot be left blank. The game sends its nickname only while it has
    // none of its own, which is the first call, so remembering it there covers
    // every renewal after.
    function createInvite(message) {
      if (typeof message.nickname === 'string' && message.nickname !== '') {
        room.nickname = message.nickname;
      }
      room.key = typeof message.key === 'string' && message.key !== '' ? message.key : newKey();

      rpc('polytrack_room_create', { p_key: room.key, p_name: room.nickname })
        .then(function (created) {
          room.code = created.code;
          socket.deliver({
            type: 'createInvite',
            inviteCode: created.code,
            key: room.key,
            timeoutMilliseconds: created.timeout_milliseconds,
            censoredNickname: room.nickname || 'Player'
          });
          return openChannel(created.code, {
            join: onJoin,
            'join-ice': onJoinerIce,
            leave: onLeave
          });
        })
        .then(function (channel) {
          // The host can give up on the room while the channel is still
          // opening, and a channel nobody is holding never gets torn down.
          if (socket.readyState === 3) channel.unsubscribe();
          else room.channel = channel;
        })
        .catch(function (error) {
          console.error('Failed to open a room:', error);
          socket.deliver({ type: 'error', error: 'UnknownServerError' });
        });
    }

    socket.send = function (raw) {
      var message = parse(raw);
      if (message === null) return;
      if (message.type === 'createInvite') createInvite(message);
      else if (message.type === 'acceptJoin') {
        // Forwarded whole. clientId, the version string and the mod fields are
        // the host's own, and the joiner validates every one of them.
        post(room.channel, 'accept', {
          session: message.session,
          answer: message.answer,
          version: message.version,
          mods: message.mods,
          isModsVanillaCompatible: message.isModsVanillaCompatible,
          clientId: message.clientId
        });
      } else if (message.type === 'declineJoin') {
        post(room.channel, 'decline', {
          session: message.session,
          reason: message.reason
        });
      } else if (message.type === 'iceCandidate') {
        post(room.channel, 'host-ice', {
          session: message.session,
          candidate: message.candidate
        });
      }
    };

    var close = socket.close;
    socket.close = function () {
      if (room.channel !== null) {
        room.channel.unsubscribe();
        room.channel = null;
      }
      close.call(socket);
    };
  }

  function joinRole(socket) {
    socket.send = function (raw) {
      var message = parse(raw);
      if (message === null) return;
      socket.deliver({ type: 'declineJoin', reason: 'UnknownServerError' });
    };
  }

  // ── The stand-in ─────────────────────────────────────────
  // Returning a different object from a constructor replaces the instance, so
  // a passed-through call hands back a genuine WebSocket. The game cannot tell
  // the difference, and a socket that is none of our business never sees this
  // file again.
  //
  // Opening is deferred by a turn because the game attaches its listeners on
  // the line after the constructor returns. An open event raised synchronously
  // would land before anything was listening.

  function PatchedWebSocket(url, protocols) {
    var role = roleOf(url);
    if (role === null) return nativeSocket(url, protocols);

    var socket = new FakeWebSocket(url);
    if (role === 'host') hostRole(socket);
    else joinRole(socket);

    setTimeout(function () { socket.opened(); }, 0);
    return socket;
  }

  PatchedWebSocket.CONNECTING = 0;
  PatchedWebSocket.OPEN = 1;
  PatchedWebSocket.CLOSING = 2;
  PatchedWebSocket.CLOSED = 3;

  window.WebSocket = PatchedWebSocket;

  // leaderboard.js answers the game's iceServers request and is loaded
  // before this file, so it reads the list through here at call time.
  window.GV = window.GV || {};
  window.GV.rooms = { iceServers: iceServers };
}());

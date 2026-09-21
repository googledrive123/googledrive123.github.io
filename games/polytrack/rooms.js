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

  // ── What the lobby sees ────────────────────────────────────
  // rooms_ui.js needs to know which room this page is in and to talk to the
  // others in it. It rides the same channel rather than opening a second one,
  // under a single event name, because a supabase channel only accepts
  // handlers before it subscribes and the lobby's vocabulary is still growing.

  var lobby = { code: null, role: null, channel: null, states: [], messages: [] };

  function announce() {
    var state = { code: lobby.code, role: lobby.role };
    for (var i = 0; i < lobby.states.length; i++) {
      try { lobby.states[i](state); } catch (e) { console.error(e); }
    }
  }

  function onLobbyMessage(payload) {
    for (var i = 0; i < lobby.messages.length; i++) {
      try { lobby.messages[i](payload); } catch (e) { console.error(e); }
    }
  }

  function enterLobby(role, code, channel) {
    lobby.role = role;
    lobby.code = code;
    lobby.channel = channel;
    announce();
  }

  function leaveLobby() {
    if (lobby.channel === null) return;
    lobby.role = null;
    lobby.code = null;
    lobby.channel = null;
    announce();
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
    var room = { code: null, key: null, nickname: null, channel: null, beat: null };
    // seen holds each joining session's state, which is 'pending' from the
    // moment its request arrives until its offer has been handed over, then
    // 'ready'. held keeps whatever turned up in between.
    var seen = {};
    var held = {};

    // The game drops an ICE candidate for a session it has not been told about
    // yet, with a warning and nothing else, and the one it drops may be the
    // candidate that would have connected. Handing over an offer takes a round
    // trip to fetch the ICE list, which is easily long enough for the joiner's
    // first candidates to overtake it, so they wait their turn.
    function relay(session, message) {
      if (seen[session] === 'ready') socket.deliver(message);
      else if (seen[session] === 'pending') held[session].push(message);
    }

    // Two clocks have to be held off. The game closes the socket after thirty
    // five seconds without a message, and a room stops being findable ten
    // minutes after it was last touched. A host sitting in an empty lobby
    // waiting for a friend trips both.
    //
    // pong is the one inbound type the game accepts and then ignores, which
    // makes it the right thing to send when there is nothing to say.
    function startHeartbeat() {
      var ticks = 0;
      room.beat = setInterval(function () {
        socket.deliver({ type: 'pong' });
        ticks = ticks + 1;
        if (ticks % 4 === 0 && room.code !== null) {
          rpc('polytrack_room_touch', { p_code: room.code, p_key: room.key })
            .catch(function (error) { console.error('Room keep-alive failed:', error); });
        }
      }, 15000);
    }

    // A join request reaches the host as a joinInvite. The ICE list rides
    // along with it, because that is where the game reads it from when it
    // builds the peer connection for this particular player.
    function onJoin(payload) {
      if (typeof payload.session !== 'string' || typeof payload.offer !== 'string') return;
      // A joiner repeats its request until it is answered, so the same session
      // arrives more than once. Handing the game a second one would have it
      // build a second peer connection for a player who already has one.
      if (seen[payload.session] !== undefined) return;
      seen[payload.session] = 'pending';
      held[payload.session] = [];

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

        seen[payload.session] = 'ready';
        var waiting = held[payload.session];
        delete held[payload.session];
        for (var i = 0; i < waiting.length; i++) socket.deliver(waiting[i]);
      });
    }

    function onJoinerIce(payload) {
      if (typeof payload.session !== 'string') return;
      relay(payload.session, {
        type: 'iceCandidate',
        session: payload.session,
        candidate: payload.candidate
      });
    }

    function onLeave(payload) {
      if (typeof payload.session !== 'string') return;
      relay(payload.session, { type: 'joinDisconnect', session: payload.session });
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
            leave: onLeave,
            lobby: onLobbyMessage
          });
        })
        .then(function (channel) {
          // The host can give up on the room while the channel is still
          // opening, and a channel nobody is holding never gets torn down.
          if (socket.readyState === 3) {
            channel.unsubscribe();
            return;
          }
          room.channel = channel;
          enterLobby('host', room.code, channel);
          startHeartbeat();
          // Warmed now rather than when the first player knocks, so handing
          // over an offer is a local step instead of a round trip.
          iceServers();
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
      if (room.beat !== null) {
        clearInterval(room.beat);
        room.beat = null;
      }
      if (room.channel !== null) {
        leaveLobby();
        room.channel.unsubscribe();
        room.channel = null;
      }
      close.call(socket);
    };
  }

  function joinRole(socket) {
    var seat = { session: newKey(), channel: null, waiting: [], retry: null };

    // The host subscribes to the channel a moment after its code appears on
    // screen, and a broadcast sent into a room nobody is listening to is
    // simply gone. Repeating the request costs nothing and covers both that
    // gap and an ordinary dropped message.
    function stopRetry() {
      if (seat.retry === null) return;
      clearInterval(seat.retry);
      seat.retry = null;
    }

    function onAccept(payload) {
      if (payload.session !== seat.session) return;
      stopRetry();
      socket.deliver({
        type: 'acceptJoin',
        answer: payload.answer,
        version: typeof payload.version === 'string' ? payload.version : '0.6.3',
        mods: Array.isArray(payload.mods) ? payload.mods : [],
        isModsVanillaCompatible: payload.isModsVanillaCompatible !== false,
        clientId: typeof payload.clientId === 'number' ? payload.clientId : 0
      });
    }

    function onDecline(payload) {
      if (payload.session !== seat.session) return;
      stopRetry();
      socket.deliver({ type: 'declineJoin', reason: payload.reason });
    }

    function onHostIce(payload) {
      if (payload.session !== seat.session) return;
      stopRetry();
      socket.deliver({ type: 'iceCandidate', candidate: payload.candidate });
    }

    // Candidates start arriving the moment the game sets its local
    // description, which is well before the channel has finished subscribing.
    // Holding them is the difference between a connection that pairs and one
    // that has half its routes missing.
    function toHost(event, payload) {
      if (seat.channel === null) seat.waiting.push([event, payload]);
      else post(seat.channel, event, payload);
    }

    function flush() {
      while (seat.waiting.length > 0) {
        var held = seat.waiting.shift();
        post(seat.channel, held[0], held[1]);
      }
    }

    // A code nobody is hosting and a code whose room has gone quiet are the
    // same thing to the player, and the game already has a word for it.
    function request(message) {
      rpc('polytrack_room_lookup', { p_code: message.inviteCode })
        .then(function (room) {
          if (room === null) {
            socket.deliver({ type: 'error', error: 'ExpiredInvite' });
            return;
          }
          return openChannel(room.code, {
            accept: onAccept,
            decline: onDecline,
            'host-ice': onHostIce,
            lobby: onLobbyMessage
          }).then(function (channel) {
            if (socket.readyState === 3) {
              channel.unsubscribe();
              return;
            }
            seat.channel = channel;
            enterLobby('player', room.code, channel);

            var hello = {
              session: seat.session,
              offer: message.offer,
              version: message.version,
              mods: message.mods,
              isModsVanillaCompatible: message.isModsVanillaCompatible,
              nickname: message.nickname,
              countryCode: message.countryCode,
              carStyle: message.carStyle
            };
            post(channel, 'join', hello);
            flush();

            var left = 4;
            seat.retry = setInterval(function () {
              if (left === 0) {
                stopRetry();
                return;
              }
              left = left - 1;
              post(channel, 'join', hello);
            }, 1500);
          });
        })
        .catch(function (error) {
          console.error('Failed to join a room:', error);
          socket.deliver({ type: 'error', error: 'ExpiredInvite' });
        });
    }

    socket.send = function (raw) {
      var message = parse(raw);
      if (message === null) return;
      // Nothing on this socket carries a type: the path is the context. The
      // first message is the join request, everything after is a candidate.
      if (typeof message.inviteCode === 'string') request(message);
      else if ('candidate' in message) {
        toHost('join-ice', { session: seat.session, candidate: message.candidate });
      }
    };

    var close = socket.close;
    socket.close = function () {
      stopRetry();
      if (seat.channel !== null) {
        post(seat.channel, 'leave', { session: seat.session });
        leaveLobby();
        seat.channel.unsubscribe();
        seat.channel = null;
      }
      close.call(socket);
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
  window.GV.rooms = {
    iceServers: iceServers,
    state: function () { return { code: lobby.code, role: lobby.role }; },
    onState: function (fn) { lobby.states.push(fn); },
    onMessage: function (fn) { lobby.messages.push(fn); },
    say: function (payload) { post(lobby.channel, 'lobby', payload); }
  };
}());

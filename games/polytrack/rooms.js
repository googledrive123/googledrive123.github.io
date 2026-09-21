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

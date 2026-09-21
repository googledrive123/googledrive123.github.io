-- Server side of PolyTrack rooms.
--
-- The game's multiplayer connects players peer to peer, but two browsers
-- cannot find each other without somewhere to swap a room code and a
-- connection offer first. That is all this table is for. No race data passes
-- through it: once the handshake is done the two players talk directly.
--
-- A room is short lived by design. It exists from the moment a host opens the
-- multiplayer menu until a few minutes after the last time anyone touched it,
-- and then it is swept. Nothing here is worth keeping.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 21 September 2026.


-- code is what a player types in, so it is the primary key: looking a room up
-- by code is the only read this table ever serves.
--
-- host_key is the secret the game generates for its own invite and sends on
-- every createInvite. Holding it is what proves a caller is the host, which is
-- what guards settings writes once those exist.
--
-- last_seen drives expiry rather than created_at, so a room that is still
-- being used does not vanish out from under a long session.
create table if not exists public.polytrack_rooms (
  code text primary key,
  host_key text not null,
  host_name text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index if not exists polytrack_rooms_last_seen_idx
  on public.polytrack_rooms (last_seen);

-- Every path in and out of this table is a security definer function, so there
-- is no policy to write. RLS on with no policies means a direct PostgREST
-- request against the table reads nothing and writes nothing.
alter table public.polytrack_rooms enable row level security;

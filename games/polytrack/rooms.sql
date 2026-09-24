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

-- A public room is listed for anyone to join without typing its code. Rooms
-- are private unless the host asks otherwise, which is also what every room
-- made before this column existed was.
alter table public.polytrack_rooms
  add column if not exists is_public boolean not null default false;

-- What the public list shows beside the host's name. The host reports it with
-- every keep-alive, so it follows the room from track to track.
alter table public.polytrack_rooms
  add column if not exists track_name text;

-- Every path in and out of this table is a security definer function, so there
-- is no policy to write. RLS on with no policies means a direct PostgREST
-- request against the table reads nothing and writes nothing.
alter table public.polytrack_rooms enable row level security;


-- Codes are typed by hand off a screen, often read out loud, so the alphabet
-- drops the characters people confuse: O and 0, I and 1. Six characters out of
-- the remaining thirty-two is about a billion rooms, which is far more than
-- enough given a room lives for minutes.
--
-- The game uppercases whatever is typed before sending it, so codes are stored
-- uppercase and compared as stored.
create or replace function public.polytrack_room_code()
returns text
language plpgsql
as $function$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text := '';
  i integer;
begin
  for i in 1..6 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::integer, 1);
  end loop;
  return v_code;
end;
$function$;


-- Called when the host opens the multiplayer menu. Retries on the unlikely
-- collision rather than trusting one draw, and gives up after a few attempts
-- so a full keyspace cannot spin here forever.
create or replace function public.polytrack_room_create(
  p_key text,
  p_name text default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code text;
  v_attempt integer := 0;
begin
  if not public.gv_origin_allowed() then
    raise exception 'rooms are not created from this origin';
  end if;
  if p_key is null or char_length(p_key) not between 1 and 128 then
    raise exception 'invalid host key';
  end if;

  -- Abandoned rooms are swept here rather than on a schedule. Room creation is
  -- rare enough to carry it and frequent enough that nothing piles up.
  delete from polytrack_rooms where last_seen < now() - interval '30 minutes';

  loop
    v_attempt := v_attempt + 1;
    v_code := public.polytrack_room_code();

    insert into polytrack_rooms (code, host_key, host_name)
    values (v_code, p_key, left(nullif(btrim(coalesce(p_name, '')), ''), 50))
    on conflict (code) do nothing;

    if found then
      return json_build_object('code', v_code, 'timeout_milliseconds', 600000);
    end if;

    if v_attempt >= 8 then
      raise exception 'could not allocate a room code';
    end if;
  end loop;
end;
$function$;


-- Called when a player types a code in. Returns null for a code that was never
-- issued and for one whose room has gone quiet, which the join screen reports
-- the same way: the room is not there.
create or replace function public.polytrack_room_lookup(p_code text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_room polytrack_rooms;
begin
  if not public.gv_origin_allowed() then
    raise exception 'rooms are not read from this origin';
  end if;
  if p_code is null or char_length(p_code) not between 1 and 32 then
    return null;
  end if;

  select * into v_room
  from polytrack_rooms
  where code = upper(btrim(p_code))
    and last_seen > now() - interval '10 minutes';

  if not found then
    return null;
  end if;

  return json_build_object('code', v_room.code, 'host_name', v_room.host_name);
end;
$function$;


-- The host calls this while its room is open. Without it a room that outlives
-- the ten minute window stops being findable even though the host is sitting
-- in the lobby waiting for someone.
create or replace function public.polytrack_room_touch(
  p_code text,
  p_key text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.gv_origin_allowed() then
    raise exception 'rooms are not updated from this origin';
  end if;

  update polytrack_rooms
  set last_seen = now()
  where code = upper(btrim(coalesce(p_code, '')))
    and host_key = p_key;
end;
$function$;


-- WebRTC needs a list of STUN and TURN servers before it will try to connect.
-- STUN is free and public; a TURN relay is what carries the connection when a
-- network blocks direct traffic, which school and office networks routinely
-- do, and a relay comes with credentials.
--
-- This repository is public, so those credentials cannot live in it: anyone
-- reading the source would be spending someone else's relay quota. They live
-- in a row here instead, handed out per request behind the origin gate, and
-- the game never learns where they came from.
--
-- This row is the fallback, and it holds public STUN only. TURN proper is
-- handled by the ice-servers edge function, which mints short lived Cloudflare
-- credentials from a key held in its environment. Credentials that expire are
-- worth the extra moving part: a static username and password handed to every
-- visitor is a relay quota anyone can spend.
--
-- The game asks the function first and falls back to this row, so rooms keep
-- working on ordinary connections even if the function is down.
create table if not exists public.polytrack_settings (
  key text primary key,
  value jsonb not null
);

alter table public.polytrack_settings enable row level security;

insert into public.polytrack_settings (key, value)
values ('ice_servers', '[
  {"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}
]'::jsonb)
on conflict (key) do nothing;


create or replace function public.polytrack_ice_servers()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_value jsonb;
begin
  if not public.gv_origin_allowed() then
    raise exception 'ice servers are not served to this origin';
  end if;

  select value into v_value from polytrack_settings where key = 'ice_servers';
  return coalesce(v_value, '[]'::jsonb);
end;
$function$;


-- Anyone can read the anon key out of this repo and the origin header can be
-- forged by anything that is not a browser, so the ice-servers function is
-- reachable by a determined stranger. Relay traffic is billed past the free
-- tier, which makes a scraped credential worth something.
--
-- This caps how many credentials one address can be issued per hour. A player
-- needs one per room, and the page holds it for half an hour, so the ceiling
-- is far above any honest use and well below anything worth farming.
create table if not exists public.polytrack_ice_grants (
  ip text not null,
  window_start timestamptz not null,
  grants integer not null default 0,
  primary key (ip, window_start)
);

alter table public.polytrack_ice_grants enable row level security;


-- Called by the ice-servers edge function with the service role, never by the
-- browser. Counting a request the caller made against themselves is the worst
-- anyone can do by calling it directly.
create or replace function public.polytrack_ice_allow(
  p_ip text,
  p_limit integer default 40
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count integer;
begin
  delete from polytrack_ice_grants where window_start < now() - interval '3 hours';

  insert into polytrack_ice_grants (ip, window_start, grants)
  values (coalesce(nullif(btrim(p_ip), ''), 'unknown'), v_window, 1)
  on conflict (ip, window_start) do update
    set grants = polytrack_ice_grants.grants + 1
  returning grants into v_count;

  return v_count <= p_limit;
end;
$function$;

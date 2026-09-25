-- Who is playing, for the analytics dashboard, and the creator's way in.
--
-- The dashboard shows visitors by id, which says nothing about who they are.
-- This puts names to them, keeps track of who is in PolyTrack right now and
-- which room they are in, and lets the site owner drop into a player's game
-- from the dashboard.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice.


-- One row per browser with PolyTrack open, refreshed every few seconds by
-- games/polytrack/creator.js. code and role are the room the player is in,
-- and both are null for someone racing on their own. A row not refreshed in
-- the last minute is someone who has left.
create table if not exists public.polytrack_presence (
  visitor_id text primary key,
  user_id uuid,
  name text,
  code text,
  role text,
  updated_at timestamptz not null default now()
);

-- Every path in and out is a security definer function, so there is no
-- policy to write and a direct PostgREST request reads and writes nothing.
alter table public.polytrack_presence enable row level security;


-- A request from the dashboard for a solo player's game to open a room, so
-- the site owner can join them. Picked up by that player's next presence
-- beat and marked taken, so one click opens one room.
create table if not exists public.gv_creator_calls (
  id bigint generated always as identity primary key,
  visitor_id text not null,
  created_at timestamptz not null default now(),
  taken_at timestamptz
);

alter table public.gv_creator_calls enable row level security;


-- Called by PolyTrack every few seconds while it is open. Records where the
-- player is and hands back any call waiting for them, marking it taken in
-- the same statement so two beats can never both act on it.
--
-- Anyone can call this for any visitor id, since those ids appear on the
-- leaderboard. The worst that does is claim someone's pending call before
-- they do, which only means the dashboard's join times out.
create or replace function public.polytrack_presence_beat(
  p_visitor_id text,
  p_name text default null,
  p_code text default null,
  p_role text default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_call bigint;
begin
  if not public.gv_origin_allowed() then
    raise exception 'presence is not accepted from this origin';
  end if;
  if p_visitor_id is null or char_length(p_visitor_id) not between 1 and 64 then
    raise exception 'invalid visitor id';
  end if;

  -- Swept here rather than on a schedule, the same way rooms are.
  delete from polytrack_presence where updated_at < now() - interval '10 minutes';
  delete from gv_creator_calls where created_at < now() - interval '1 hour';

  insert into polytrack_presence (visitor_id, user_id, name, code, role, updated_at)
  values (
    p_visitor_id,
    auth.uid(),
    left(nullif(btrim(coalesce(p_name, '')), ''), 50),
    left(nullif(btrim(coalesce(p_code, '')), ''), 32),
    case when p_role in ('host', 'player') then p_role end,
    now()
  )
  on conflict (visitor_id) do update
    set user_id = excluded.user_id,
        name = excluded.name,
        code = excluded.code,
        role = excluded.role,
        updated_at = excluded.updated_at;

  -- A call older than two minutes is one the dashboard has already given up
  -- on, and acting on it would open a room nobody is coming to.
  update gv_creator_calls
  set taken_at = now()
  where id = (
    select id from gv_creator_calls
    where visitor_id = p_visitor_id
      and taken_at is null
      and created_at > now() - interval '2 minutes'
    order by created_at
    limit 1
    for update skip locked
  )
  returning id into v_call;

  if v_call is null then
    return json_build_object('call', null);
  end if;
  return json_build_object('call', json_build_object('id', v_call));
end;
$function$;

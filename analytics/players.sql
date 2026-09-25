-- Who is playing, for the analytics dashboard, and the creator's way in.
--
-- The dashboard shows visitors by id, which says nothing about who they are.
-- This puts names to them, keeps track of who is in PolyTrack right now and
-- which room they are in, and lets the site owner drop into a player's game
-- from the dashboard.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 25 September 2026.


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


-- Names for the visitor ids the dashboard is showing: the GameVault username
-- for a signed-in visitor, and the name they race under in PolyTrack.
--
-- p_people is a list of {visitor_id, user_id}. The dashboard already knows
-- which visitors signed in from the events it loaded, so it says rather than
-- this digging through every event to work it out again.
--
-- A board row in anonymous mode reads "Anonymous", which is no help here, so
-- a real name from the board wins, then the one PolyTrack last reported.
create or replace function public.analytics_people(p_secret text, p_people json)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  return coalesce((
    select json_agg(json_build_object(
      'visitor_id', q.visitor_id,
      'username', (select p.username from profiles p where p.id = q.user_id),
      'polytrack', coalesce(
        (select s.nickname from polytrack_scores s
          where s.player_key in (q.user_id::text, 'guest:' || q.visitor_id)
            and s.nickname <> 'Anonymous'
          order by s.updated_at desc limit 1),
        (select pr.name from polytrack_presence pr where pr.visitor_id = q.visitor_id),
        (select s.nickname from polytrack_scores s
          where s.player_key in (q.user_id::text, 'guest:' || q.visitor_id)
          order by s.updated_at desc limit 1)
      )
    ))
    from (
      select distinct on (x->>'visitor_id')
             x->>'visitor_id' as visitor_id,
             nullif(x->>'user_id', '')::uuid as user_id
      from json_array_elements(coalesce(p_people, '[]'::json)) x
      where coalesce(x->>'visitor_id', '') <> ''
      order by x->>'visitor_id', (x->>'user_id') is null
      limit 2000
    ) q
  ), '[]'::json);
end;
$function$;


-- Everyone in PolyTrack right now, for the dashboard's Playing now list:
-- where they are, and a name to go with them. A beat lands every five
-- seconds, so forty five allows for a few that went missing.
create or replace function public.analytics_polytrack_live(p_secret text)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  return coalesce((
    select json_agg(json_build_object(
      'visitor_id', pr.visitor_id,
      'user_id', pr.user_id,
      'username', p.username,
      'name', pr.name,
      -- The host's current code, not the one a player joined on: a host
      -- whose game had to open a fresh invite is on a new one, and joining
      -- the old one reaches nobody.
      'code', coalesce((
        select newest.code
        from polytrack_rooms joined
        join polytrack_rooms newest on newest.host_key = joined.host_key
        where joined.code = pr.code
        order by newest.created_at desc
        limit 1
      ), pr.code),
      'role', pr.role,
      'updated_at', pr.updated_at
    ) order by pr.updated_at desc)
    from polytrack_presence pr
    left join profiles p on p.id = pr.user_id
    where pr.updated_at > now() - interval '45 seconds'
  ), '[]'::json);
end;
$function$;


-- The dashboard's Join on a solo player: asks their game to open a room.
-- Nothing is asked of the player. Their game ends the run, hosts on its
-- own, and the dashboard follows them in once the room shows up in their
-- presence.
create or replace function public.gv_creator_summon(p_secret text, p_visitor_id text)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id bigint;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;
  if p_visitor_id is null or char_length(p_visitor_id) not between 1 and 64 then
    raise exception 'invalid visitor id';
  end if;

  insert into gv_creator_calls (visitor_id) values (p_visitor_id)
  returning id into v_id;
  return v_id;
end;
$function$;


-- Proof that whoever just joined a room really is the site owner. The room
-- channel is open to anyone holding the code, so a message there saying
-- "the creator joined" could come from any player. The dashboard mints a
-- ticket for one room, the creator's game sends it into the room, and every
-- other game checks it here before showing anything.
create table if not exists public.gv_creator_visits (
  ticket text primary key,
  code text not null,
  created_at timestamptz not null default now()
);

alter table public.gv_creator_visits enable row level security;


create or replace function public.gv_creator_ticket(p_secret text, p_code text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ticket text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;
  if p_code is null or char_length(btrim(p_code)) not between 1 and 32 then
    raise exception 'invalid room code';
  end if;

  delete from gv_creator_visits where created_at < now() - interval '1 day';
  insert into gv_creator_visits (ticket, code) values (v_ticket, upper(btrim(p_code)));
  return v_ticket;
end;
$function$;


-- Asked by every game in the room when the creator's ticket arrives. A
-- ticket only vouches for the room it was minted for, and only for a few
-- hours, so an old one replayed into another room proves nothing.
create or replace function public.gv_creator_check(p_code text, p_ticket text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.gv_origin_allowed() then
    raise exception 'tickets are not checked from this origin';
  end if;

  -- The ticket's room, or any room with the same host: players who joined
  -- before the host's game opened a fresh invite are still on the old code.
  return exists (
    select 1 from gv_creator_visits v
    where v.ticket = p_ticket
      and v.created_at > now() - interval '6 hours'
      and (
        v.code = upper(btrim(coalesce(p_code, '')))
        or exists (
          select 1
          from polytrack_rooms minted
          join polytrack_rooms asked on asked.host_key = minted.host_key
          where minted.code = v.code
            and asked.code = upper(btrim(coalesce(p_code, '')))
        )
      )
  );
end;
$function$;

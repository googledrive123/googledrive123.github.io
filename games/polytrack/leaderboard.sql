-- Server side of the PolyTrack leaderboard.
--
-- The table and the two functions the board already ran on were created by
-- hand in the Supabase dashboard and never written down here. This file is the
-- record of the change that added names to the board, and it is what has to be
-- applied to the project for leaderboard.js to behave as written.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 21 September 2026; the board on 24 September 2026;
-- replays on 25 September 2026, recovered replays the same day.


-- The replay of each time on the board, so other players can watch it and
-- race against it. The game sends one with every run it submits, deflated
-- and base64url encoded, and refuses to send any over 10,000 characters.
-- Rows set before this column existed have none, and stay without one until
-- their player beats their own time.
alter table public.polytrack_scores
  add column if not exists recording text;


-- A run is filed under the player's public name, and that name can change
-- without a new run being set: turning anonymous mode on has to take the name
-- off the times already on the board. The old upsert only wrote anything when
-- the run was faster, so the name got stuck at whatever it was on the day of
-- the player's best lap. It now refreshes the name on every submission and
-- still keeps the better time.
-- Dropped first because it gains an argument, and the old six argument
-- version left beside it would make every call ambiguous to PostgREST.
drop function if exists public.polytrack_submit(text, integer, text, text, text, text);

create or replace function public.polytrack_submit(
  p_track_id text,
  p_frames integer,
  p_nickname text,
  p_country_code text default null,
  p_car_style text default null,
  p_visitor_id text default null,
  p_recording text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if not public.gv_origin_allowed() then
    raise exception 'submissions are not accepted from this origin';
  end if;
  if p_frames is null or p_frames <= 0 or p_frames > 5999999 then
    raise exception 'invalid frame count';
  end if;
  if p_track_id is null or char_length(p_track_id) not between 1 and 120 then
    raise exception 'invalid track id';
  end if;
  -- A guest with no visitor id has no identity to key a row on, so there is
  -- nothing to upsert against and the row would duplicate on every run.
  if v_user is null and coalesce(char_length(p_visitor_id), 0) = 0 then
    raise exception 'missing identity';
  end if;

  insert into polytrack_scores (
    user_id, visitor_id, nickname, country_code, track_id, frames, car_style, recording
  )
  values (
    v_user,
    case when v_user is null then left(p_visitor_id, 64) end,
    left(coalesce(nullif(btrim(p_nickname), ''), 'Player'), 50),
    left(nullif(btrim(coalesce(p_country_code, '')), ''), 8),
    p_track_id,
    p_frames,
    left(p_car_style, 256),
    -- The game will not send one this long; anything that does is not it.
    case when char_length(p_recording) between 1 and 12000 then p_recording end
  )
  on conflict (player_key, track_id) do update
    set nickname     = excluded.nickname,
        country_code = excluded.country_code,
        frames       = least(excluded.frames, polytrack_scores.frames),
        -- The car, the replay and the date belong to the run on the board,
        -- so they only move when the run does.
        car_style    = case when excluded.frames < polytrack_scores.frames
                            then excluded.car_style else polytrack_scores.car_style end,
        recording    = case when excluded.frames < polytrack_scores.frames
                            then excluded.recording else polytrack_scores.recording end,
        updated_at   = case when excluded.frames < polytrack_scores.frames
                            then now() else polytrack_scores.updated_at end;
end;
$function$;

-- The same access the six argument version had: signed in or not, but not to
-- anything that is neither.
revoke all on function public.polytrack_submit(text, integer, text, text, text, text, text) from public;
grant execute on function public.polytrack_submit(text, integer, text, text, text, text, text) to anon, authenticated;


-- Renaming without racing. A player who changes their name, or turns
-- anonymous mode on or off, has times already sitting on boards for tracks
-- they are not going to drive again today.
create or replace function public.polytrack_set_name(
  p_visitor_id text,
  p_nickname text
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_key  text := coalesce(v_user::text, 'guest:' || nullif(p_visitor_id, ''));
  v_name text := left(coalesce(nullif(btrim(p_nickname), ''), 'Player'), 50);
  v_rows integer := 0;
begin
  if not public.gv_origin_allowed() then
    raise exception 'submissions are not accepted from this origin';
  end if;
  if v_key is null then
    return 0;
  end if;

  -- updated_at is left alone: it is the date of the run, and a rename is not
  -- a run.
  update polytrack_scores
     set nickname = v_name
   where player_key = v_key
     and nickname is distinct from v_name;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$;

grant execute on function public.polytrack_set_name(text, text) to anon, authenticated;


-- Signing in used to split a player in two: the guest rows stayed where they
-- were under the browser's visitor id and the account started an empty second
-- set. This hands the guest rows over to the account, keeping the better time
-- wherever both exist for the same track.
create or replace function public.polytrack_claim(
  p_visitor_id text
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user  uuid := auth.uid();
  v_key   text;
  v_moved integer := 0;
begin
  if v_user is null or coalesce(char_length(p_visitor_id), 0) = 0 then
    return 0;
  end if;
  v_key := 'guest:' || p_visitor_id;

  -- Guest rows the account already matches or beats have nothing to add.
  delete from polytrack_scores g
   using polytrack_scores u
   where g.player_key = v_key
     and u.user_id = v_user
     and u.track_id = g.track_id
     and u.frames <= g.frames;

  -- Where the guest was faster, its row is the one that survives.
  delete from polytrack_scores u
   using polytrack_scores g
   where u.user_id = v_user
     and g.player_key = v_key
     and g.track_id = u.track_id
     and g.frames < u.frames;

  -- player_key is generated from these two columns, so the rows move to the
  -- account's half of the board on their own.
  update polytrack_scores
     set user_id = v_user,
         visitor_id = null
   where player_key = v_key;

  get diagnostics v_moved = row_count;
  return v_moved;
end;
$function$;

grant execute on function public.polytrack_claim(text) to authenticated;


-- The board itself, as it stood when it was first written down here. Like the
-- table, it was created by hand in the dashboard.
--
-- Guests rank below accounts: is_guest sorts first. userId is the row's own
-- player key rather than anything the game knows, which is why leaderboard.js
-- has to relabel the caller's row for the game to find it.
--
-- gvVerified is the blue check from analytics/verified.sql. The game has no
-- field for it, so leaderboard.js takes it off each entry before the game
-- sees the board and draws the check itself.
create or replace function public.polytrack_board(
  p_track_id text,
  p_skip integer default 0,
  p_amount integer default 50,
  p_visitor_id text default null
) returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user  uuid := auth.uid();
  v_key   text := coalesce(v_user::text, 'guest:' || nullif(p_visitor_id, ''));
  v_total integer;
  v_rows  json;
  v_self  json;
begin
  p_skip   := greatest(coalesce(p_skip, 0), 0);
  p_amount := least(greatest(coalesce(p_amount, 50), 1), 200);

  select count(*) into v_total
  from polytrack_scores where track_id = p_track_id;

  with ranked as (
    select s.*,
           row_number() over (
             order by s.is_guest, s.frames, s.created_at
           ) as position
    from polytrack_scores s
    where s.track_id = p_track_id
  )
  select coalesce(json_agg(e order by e.position), '[]'::json) into v_rows
  from (
    select r.id,
           r.player_key                        as "userId",
           r.nickname,
           r.country_code                      as "countryCode",
           r.frames,
           to_char(r.updated_at at time zone 'UTC',
                   'YYYY-MM-DD"T"HH24:MI:SS"Z"') as time,
           coalesce(r.car_style, '')           as "carStyle",
           case when r.is_guest then 0 else 1 end as "verifiedState",
           -- Anonymous mode hides who a row belongs to, and a check on it
           -- would say it is somebody worth knowing.
           v.key is not null and r.nickname <> 'Anonymous' as "gvVerified",
           -- Whether the row has a replay to watch or race. Older times do not.
           r.recording is not null             as "gvReplay",
           r.position
    from ranked r
    left join gv_verified v on v.key = r.player_key
    order by r.position
    offset p_skip limit p_amount
  ) e;

  if v_key is not null then
    with ranked as (
      select s.*,
             row_number() over (
               order by s.is_guest, s.frames, s.created_at
             ) as position
      from polytrack_scores s
      where s.track_id = p_track_id
    )
    select json_build_object('position', r.position, 'frames', r.frames, 'id', r.id)
      into v_self
    from ranked r where r.player_key = v_key;
  end if;

  return json_build_object(
    'total',     v_total,
    'entries',   v_rows,
    'userEntry', v_self
  );
end;
$function$;


-- Replays for the game's Watch and race-against buttons. The game asks for a
-- list of board row ids and wants an answer in the same order, with null for
-- any it cannot have, so each id keeps its place even when it has no replay.
create or replace function public.polytrack_recordings(p_ids bigint[])
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.gv_origin_allowed() then
    raise exception 'recordings are not served to this origin';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return '[]'::json;
  end if;
  -- The game picks at most ten opponents, so a longer list is not the game.
  if cardinality(p_ids) > 50 then
    raise exception 'too many recordings asked for';
  end if;

  return (
    select json_agg(
      case when s.recording is null then null
           else json_build_object(
             'recording', s.recording,
             'frames', s.frames,
             'carStyle', coalesce(s.car_style, ''),
             'verifiedState', case when s.is_guest then 0 else 1 end
           )
      end
      order by q.ord)
    from unnest(p_ids) with ordinality as q(id, ord)
    left join polytrack_scores s on s.id = q.id
  );
end;
$function$;

grant execute on function public.polytrack_recordings(bigint[]) to anon, authenticated;


-- Replays for times set before replays were kept. The game keeps the replay
-- of each player's best run on every track in their own browser, so the next
-- time they open it, leaderboard.js sends those up here.
--
-- A replay is only taken for the caller's own row on that track, only when
-- its time is exactly the one on the board, and only where the row has none,
-- so nobody can put a replay on someone else's time or swap out a real one.
create or replace function public.polytrack_attach_replays(
  p_visitor_id text,
  p_items json
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_key  text := coalesce(v_user::text, 'guest:' || nullif(p_visitor_id, ''));
  v_rows integer := 0;
begin
  if not public.gv_origin_allowed() then
    raise exception 'replays are not accepted from this origin';
  end if;
  if v_key is null or p_items is null or json_typeof(p_items) <> 'array' then
    return 0;
  end if;
  if json_array_length(p_items) > 20 then
    raise exception 'too many replays at once';
  end if;

  update polytrack_scores s
     set recording = i.recording
    from json_to_recordset(p_items) as i(track text, frames integer, recording text)
   where s.player_key = v_key
     and s.track_id = i.track
     and s.frames = i.frames
     and s.recording is null
     and char_length(i.recording) between 1 and 12000;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$;

grant execute on function public.polytrack_attach_replays(text, json) to anon, authenticated;

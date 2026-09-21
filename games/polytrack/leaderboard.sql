-- Server side of the PolyTrack leaderboard.
--
-- The table and the two functions the board already ran on were created by
-- hand in the Supabase dashboard and never written down here. This file is the
-- record of the change that added names to the board, and it is what has to be
-- applied to the project for leaderboard.js to behave as written.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 21 September 2026.


-- A run is filed under the player's public name, and that name can change
-- without a new run being set: turning anonymous mode on has to take the name
-- off the times already on the board. The old upsert only wrote anything when
-- the run was faster, so the name got stuck at whatever it was on the day of
-- the player's best lap. It now refreshes the name on every submission and
-- still keeps the better time.
create or replace function public.polytrack_submit(
  p_track_id text,
  p_frames integer,
  p_nickname text,
  p_country_code text default null,
  p_car_style text default null,
  p_visitor_id text default null
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
    user_id, visitor_id, nickname, country_code, track_id, frames, car_style
  )
  values (
    v_user,
    case when v_user is null then left(p_visitor_id, 64) end,
    left(coalesce(nullif(btrim(p_nickname), ''), 'Player'), 50),
    left(nullif(btrim(coalesce(p_country_code, '')), ''), 8),
    p_track_id,
    p_frames,
    left(p_car_style, 256)
  )
  on conflict (player_key, track_id) do update
    set nickname     = excluded.nickname,
        country_code = excluded.country_code,
        frames       = least(excluded.frames, polytrack_scores.frames),
        -- The car and the date belong to the run on the board, so they only
        -- move when the run does.
        car_style    = case when excluded.frames < polytrack_scores.frames
                            then excluded.car_style else polytrack_scores.car_style end,
        updated_at   = case when excluded.frames < polytrack_scores.frames
                            then now() else polytrack_scores.updated_at end;
end;
$function$;


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

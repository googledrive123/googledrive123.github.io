-- Server side of the PolyTrack leaderboard.
--
-- The table and the two functions the board already ran on were created by
-- hand in the Supabase dashboard and never written down here. This file is the
-- record of the change that added names to the board, and it is what has to be
-- applied to the project for leaderboard.js to behave as written.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice.


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

-- Public counts from the analytics events.
--
-- The home page shows a "Popular now" row and a "N playing" badge on game
-- tiles. Both come from the same events the dashboard reads, but only as
-- counts per game: no visitor ids, names or times ever leave the database.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 30 September 2026.


-- The games opened by the most different people in the last few days. Counting
-- people rather than opens keeps one person reloading a game from moving it.
create or replace function public.gv_popular(p_days integer default 7, p_limit integer default 20)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.gv_origin_allowed() then
    raise exception 'not read from this origin';
  end if;

  return coalesce((
    select json_agg(json_build_object('id', game_id, 'players', players) order by players desc, opens desc)
    from (
      select game_id, count(distinct visitor_id) as players, count(*) as opens
      from analytics_events
      where event = 'game_open'
        and game_id is not null
        and ts > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30))
      group by game_id
      order by players desc, opens desc
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
    ) t
  ), '[]'::json);
end;
$function$;

grant execute on function public.gv_popular(integer, integer) to anon, authenticated;


-- How many people have each game open right now. A visitor counts for the game
-- named by their latest event in the last four minutes (the tracker pings every
-- three while a game is open), unless that event says they left or hid the tab.
-- The tracker skips iframes, so PolyTrack, which runs in one, is also counted
-- from its own presence beat (games/polytrack/creator.js), which lands every
-- five seconds while the game is on screen. Anyone beating counts for
-- PolyTrack and nothing else. The dashboard's Playing now card reads this too,
-- so the two always agree.
create or replace function public.gv_playing_now()
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.gv_origin_allowed() then
    raise exception 'not read from this origin';
  end if;

  return coalesce((
    with racing as (
      select distinct visitor_id
      from polytrack_presence
      where updated_at > now() - interval '45 seconds'
        and visitor_id is not null
    ),
    latest as (
      select distinct on (visitor_id) visitor_id, event, game_id
      from analytics_events
      where ts > now() - interval '4 minutes'
        and event in ('ping', 'game_open', 'game_load', 'game_close', 'hidden', 'session_end')
      -- A batch of events shares one timestamp, so the id breaks the tie.
      order by visitor_id, ts desc, id desc
    ),
    playing as (
      select l.visitor_id, l.game_id
      from latest l
      where l.event in ('ping', 'game_open', 'game_load') and l.game_id is not null
        and not exists (select 1 from racing r where r.visitor_id = l.visitor_id)
      union all
      select visitor_id, 'polytrack' from racing
    )
    select json_object_agg(game_id, players)
    from (select game_id, count(*) as players from playing group by game_id) t
  ), '{}'::json);
end;
$function$;

grant execute on function public.gv_playing_now() to anon, authenticated;

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


-- Games most people could not get to load in the last three days. A game's
-- page finishing in the player counts as a load, and someone who opened a
-- game and never got one counts against it. The home page stops putting these
-- forward, and the dashboard lists them so they get fixed. It takes five
-- people, so one bad connection cannot do it. Added on 2 October 2026.
create or replace function public.gv_failing_games()
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
    select json_agg(json_build_object('id', game_id, 'name', name, 'tried', tried, 'loaded', loaded) order by tried desc)
    from (
      select game_id,
        max(item_title) as name,
        count(distinct visitor_id) filter (where event = 'game_open') as tried,
        count(distinct visitor_id) filter (where event = 'game_load') as loaded
      from analytics_events
      where event in ('game_open', 'game_load')
        and game_id is not null
        and ts > now() - interval '3 days'
      group by game_id
    ) t
    where tried >= 5 and loaded * 2 < tried
  ), '[]'::json);
end;
$function$;

grant execute on function public.gv_failing_games() to anon, authenticated;


-- What the people who played one game also played in the last 30 days, for
-- the home page's "Because you played" row. Ranked by players in common over
-- the square root of both games' players, so PolyTrack, which nearly everyone
-- plays, does not top every list just for being big. Two people in common is
-- the least that counts. Added on 2 October 2026.
create or replace function public.gv_also_played(p_game text, p_limit integer default 12)
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
    with opens as (
      select distinct game_id, visitor_id
      from analytics_events
      where event = 'game_open'
        and game_id is not null
        and visitor_id is not null
        and ts > now() - interval '30 days'
    ),
    mine as (
      select visitor_id from opens where game_id = p_game
    ),
    sizes as (
      select game_id, count(*) as players from opens group by game_id
    ),
    shared as (
      select o.game_id, count(*) as together
      from opens o
      join mine m using (visitor_id)
      where o.game_id <> p_game
      group by o.game_id
      having count(*) >= 2
    )
    select json_agg(json_build_object('id', game_id, 'together', together) order by score desc)
    from (
      select s.game_id, s.together,
        s.together / sqrt(z.players::float * (select count(*) from mine)) as score
      from shared s
      join sizes z using (game_id)
      order by score desc, s.together desc
      limit least(greatest(coalesce(p_limit, 12), 1), 30)
    ) t
  ), '[]'::json);
end;
$function$;

grant execute on function public.gv_also_played(text, integer) to anon, authenticated;

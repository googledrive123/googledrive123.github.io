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

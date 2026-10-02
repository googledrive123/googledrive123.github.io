-- Which visitor ids are people, for the dashboard's counts.
--
-- Every browser that loads the site gets an id, and not every one of them is
-- a person. URL scanners render the page from data centres, mostly Dutch or
-- German or set to UTC, at the old headless window sizes, sit there long
-- enough for the suggestion popup to open and leave without touching
-- anything. An id counts as a scanner when both are true: it never did
-- anything a person does on purpose, and it looks like one. Someone who
-- opened the site and left without clicking is still counted, just not as
-- active.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 1 October 2026, when localhost test rows were also
-- deleted (js/analytics.js no longer records from localhost).


-- Things a person does on purpose: entering the games, opening one,
-- searching, picking a category, answering a popup, signing in.
create or replace function public.analytics_is_action(p_event text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select p_event in (
    'enter', 'nav', 'game_open', 'search', 'category', 'genre', 'star', 'roll',
    'profile_open', 'auth_signin', 'suggest_close', 'suggest_click', 'cloak',
    'news_open', 'movies_enter', 'mode_tv', 'mode_movies', 'sort',
    'game_fullscreen', 'game_newtab', 'movie_play'
  );
$function$;

revoke all on function public.analytics_is_action(text) from public, anon, authenticated;

create or replace function public.analytics_scanners()
returns table (visitor_id text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.visitor_id
  from analytics_events e
  group by e.visitor_id
  having not bool_or(analytics_is_action(e.event))
     and (mode() within group (order by e.tz) in ('UTC', 'Etc/Unknown')
          or mode() within group (order by e.tz) like 'Europe/%'
          or mode() within group (order by e.viewport) in ('1280x1024', '1024x768', '800x600'));
$function$;

revoke all on function public.analytics_scanners() from public, anon, authenticated;


-- The dashboard's rows, without scanners.
create or replace function public.analytics_fetch(
  p_secret text,
  p_from timestamptz,
  p_to timestamptz,
  p_after_id bigint default 0,
  p_limit integer default 20000
) returns setof analytics_events
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.* from analytics_events e
  where analytics_check(p_secret)
    and e.ts >= p_from and e.ts < p_to and e.id > p_after_id
    and not exists (select 1 from analytics_scanners() s where s.visitor_id = e.visitor_id)
  order by e.id
  limit least(greatest(p_limit, 1), 50000);
$function$;


-- The all-time numbers, without scanners. active_visitors are the ones that
-- did something; scanners says how many ids were left out.
create or replace function public.analytics_overview(p_secret text)
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
  with s as materialized (select visitor_id from analytics_scanners()),
  h as materialized (
    select e.* from analytics_events e
    where not exists (select 1 from s where s.visitor_id = e.visitor_id)
  )
  select case when analytics_check(p_secret) then json_build_object(
    'events',    (select count(*) from h),
    'visitors',  (select count(distinct visitor_id) from h),
    'active_visitors', (select count(distinct visitor_id) from h where analytics_is_action(event)),
    'scanners',  (select count(*) from s),
    'sessions',  (select count(distinct session_id) from h),
    'users',     (select count(distinct user_id) from h where user_id is not null),
    'pageviews', (select count(*) from h where event = 'pageview'),
    'plays',     (select count(*) from h where event = 'game_open'),
    'play_secs', (select coalesce(sum(value), 0) from h where event = 'game_close'),
    'first_ts',  (select min(ts) from h),
    'last_ts',   (select max(ts) from h),
    'daily', (select coalesce(json_agg(d order by d.day), '[]'::json) from (
        select date_trunc('day', ts) as day,
               count(*) as events,
               count(distinct visitor_id) as visitors,
               count(distinct session_id) as sessions,
               count(*) filter (where event = 'pageview') as pageviews,
               count(*) filter (where event = 'game_open') as plays,
               count(distinct visitor_id) filter (where is_new) as new_visitors
        from h group by 1) d),
    'top_games', (select coalesce(json_agg(g), '[]'::json) from (
        select game_id,
               max(item_title) as name,
               count(*) filter (where event = 'game_open') as plays,
               count(distinct visitor_id) filter (where event = 'game_open') as players,
               coalesce(sum(value) filter (where event = 'game_close'), 0) as secs
        from h where game_id is not null
        group by game_id order by plays desc limit 50) g)
  ) else null end;
$function$;


-- How the visitor count grew, an hour at a time, for the dashboard's growth
-- chart: everyone seen so far, the active ones so far, and how many came on
-- that day in p_tz, the dashboard's own time zone.
create or replace function public.analytics_visitor_growth(p_secret text, p_tz text default 'UTC')
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tz text := coalesce((select name from pg_timezone_names where name = p_tz), 'UTC');
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  return coalesce((
    with s as materialized (select visitor_id from analytics_scanners()),
    h as materialized (
      select e.visitor_id, e.ts, e.event from analytics_events e
      where not exists (select 1 from s where s.visitor_id = e.visitor_id)
    ),
    firsts as (
      select visitor_id,
             min(ts) as first_ts,
             min(ts) filter (where analytics_is_action(event)) as first_act
      from h group by visitor_id
    ),
    hours as (
      select generate_series(date_trunc('hour', min(first_ts)), date_trunc('hour', now()), interval '1 hour') as hr
      from firsts
    ),
    seen as (select date_trunc('hour', first_ts) as hr, count(*) as n from firsts group by 1),
    acted as (select date_trunc('hour', first_act) as hr, count(*) as n from firsts where first_act is not null group by 1),
    days as (
      select (ts at time zone v_tz)::date as day, count(distinct visitor_id) as n
      from h group by 1
    ),
    series as (
      select hours.hr,
             sum(coalesce(seen.n, 0)) over (order by hours.hr) as total,
             sum(coalesce(acted.n, 0)) over (order by hours.hr) as active,
             coalesce(days.n, 0) as day_visitors
      from hours
      left join seen on seen.hr = hours.hr
      left join acted on acted.hr = hours.hr
      left join days on days.day = (hours.hr at time zone v_tz)::date
    )
    select json_agg(json_build_object(
             't', hr, 'total', total, 'active', active, 'day', day_visitors
           ) order by hr)
    from series
  ), '[]'::json);
end;
$function$;

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
-- deleted (js/analytics.js no longer records from localhost). Since 2 October
-- 2026 these read the running totals in analytics/rollups.sql, so apply that
-- first.


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
  -- Each visitor's most reported time zone and window size, the smallest
  -- first on a tie, as mode() picks them.
  select v.visitor_id
  from analytics_visitors v
  left join lateral (
    select t.value from analytics_visitor_traits t
    where t.visitor_id = v.visitor_id and t.trait = 'tz'
    order by t.n desc, t.value
    limit 1
  ) tz on true
  left join lateral (
    select t.value from analytics_visitor_traits t
    where t.visitor_id = v.visitor_id and t.trait = 'viewport'
    order by t.n desc, t.value
    limit 1
  ) vp on true
  where v.first_act is null
    and (tz.value in ('UTC', 'Etc/Unknown')
         or tz.value like 'Europe/%'
         or vp.value in ('1280x1024', '1024x768', '800x600'));
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


-- p_tz when Postgres knows the zone, otherwise UTC.
create or replace function public.analytics_safe_tz(p_tz text)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
begin
  perform now() at time zone coalesce(p_tz, 'UTC');
  return coalesce(p_tz, 'UTC');
exception when others then
  return 'UTC';
end;
$function$;


-- The all-time numbers, without scanners. active_visitors are the ones that
-- did something; scanners says how many ids were left out. daily counts
-- whole days in p_tz, the dashboard's own time zone, so a day is the one
-- people lived through and not midnight to midnight in UTC.
drop function if exists public.analytics_overview(text);
create or replace function public.analytics_overview(p_secret text, p_tz text default 'UTC')
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
  with s as materialized (select visitor_id from analytics_scanners()),
  z as materialized (select analytics_safe_tz(p_tz) as tz),
  v as materialized (
    select x.* from analytics_visitors x
    where not exists (select 1 from s where s.visitor_id = x.visitor_id)
  ),
  q as materialized (
    select x.* from analytics_quarters x
    where not exists (select 1 from s where s.visitor_id = x.visitor_id)
  )
  select case when analytics_check(p_secret) then json_build_object(
    'events',    (select coalesce(sum(events), 0) from q),
    'visitors',  (select count(*) from v),
    'active_visitors', (select count(*) from v where first_act is not null),
    'scanners',  (select count(*) from s),
    'sessions',  (select count(distinct session_id) from q),
    'users',     (select count(distinct u.user_id) from analytics_visitor_users u
                  where not exists (select 1 from s where s.visitor_id = u.visitor_id)),
    'pageviews', (select coalesce(sum(pageviews), 0) from q),
    'plays',     (select coalesce(sum(plays), 0) from q),
    'play_secs', (select coalesce(sum(play_secs), 0) from q),
    'first_ts',  (select min(first_ts) from v),
    'last_ts',   (select max(last_ts) from v),
    'daily', (select coalesce(json_agg(d order by d.day), '[]'::json) from (
        select (q.bucket at time zone z.tz)::date as day,
               sum(events) as events,
               count(distinct visitor_id) as visitors,
               count(distinct session_id) as sessions,
               sum(pageviews) as pageviews,
               sum(plays) as plays,
               count(distinct visitor_id) filter (where is_new) as new_visitors
        from q cross join z group by 1) d),
    'top_games', (select coalesce(json_agg(g), '[]'::json) from (
        select game_id,
               max(name) as name,
               sum(plays) as plays,
               count(*) filter (where plays > 0) as players,
               sum(secs) as secs
        from analytics_visitor_games x
        where not exists (select 1 from s where s.visitor_id = x.visitor_id)
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
  v_tz text := 'UTC';
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  -- Any zone Postgres knows. Looking for it in pg_timezone_names read every
  -- zone file on the server, most of a second each time.
  begin
    perform now() at time zone coalesce(p_tz, 'UTC');
    v_tz := coalesce(p_tz, 'UTC');
  exception when others then
    v_tz := 'UTC';
  end;

  return coalesce((
    with s as materialized (select visitor_id from analytics_scanners()),
    firsts as (
      select x.visitor_id, x.first_ts, x.first_act from analytics_visitors x
      where not exists (select 1 from s where s.visitor_id = x.visitor_id)
    ),
    hours as (
      select generate_series(date_trunc('hour', min(first_ts)), date_trunc('hour', now()), interval '1 hour') as hr
      from firsts
    ),
    seen as (select date_trunc('hour', first_ts) as hr, count(*) as n from firsts group by 1),
    acted as (select date_trunc('hour', first_act) as hr, count(*) as n from firsts where first_act is not null group by 1),
    days as (
      select (q.bucket at time zone v_tz)::date as day, count(distinct q.visitor_id) as n
      from analytics_quarters q
      where not exists (select 1 from s where s.visitor_id = q.visitor_id)
      group by 1
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

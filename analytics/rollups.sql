-- Running totals the dashboard reads instead of every event.
--
-- The all-time numbers, the visitor growth chart and the scanner check used
-- to read all of analytics_events on every load. That took a few seconds at
-- 76,000 rows, close to the 3 second limit Supabase puts on a request, and
-- the table grows by about 14,000 rows a day. These tables hold the same
-- counts, a little at a time, and a trigger adds to them as rows arrive.
--
--   analytics_visitors        when each visitor was first and last seen, and
--                             first did something on purpose
--   analytics_visitor_traits  how often each visitor reported each time zone
--                             and window size, for the scanner check
--   analytics_quarters        events, page views, plays and play time per
--                             visitor and session, 15 minutes at a time
--   analytics_visitor_users   which accounts each visitor signed in as
--   analytics_visitor_games   plays and play time per game and visitor
--
-- Fifteen minutes because every time zone in use today is a whole number of
-- quarter hours off UTC, so a quarter always falls on one day wherever the
-- dashboard is opened.
--
-- Deleting or changing events works the totals out again for the visitors
-- they belonged to. TRUNCATE does not: run analytics_roll_redo(null) after it.
--
-- Apply against project dxwjxzmlezfyursysays, before analytics/visitors.sql.
-- Every statement is safe to run twice.


create table if not exists public.analytics_visitors (
  visitor_id text primary key,
  first_ts timestamptz not null,
  last_ts timestamptz not null,
  first_act timestamptz
);

create table if not exists public.analytics_visitor_traits (
  visitor_id text not null,
  trait text not null,
  value text not null,
  n bigint not null,
  primary key (visitor_id, trait, value)
);

create table if not exists public.analytics_quarters (
  bucket timestamptz not null,
  visitor_id text not null,
  session_id text not null,
  events bigint not null,
  pageviews bigint not null,
  plays bigint not null,
  play_secs double precision not null,
  is_new boolean not null,
  primary key (bucket, visitor_id, session_id)
);
create index if not exists analytics_quarters_visitor_idx on public.analytics_quarters (visitor_id);

create table if not exists public.analytics_visitor_users (
  visitor_id text not null,
  user_id uuid not null,
  primary key (visitor_id, user_id)
);

create table if not exists public.analytics_visitor_games (
  game_id text not null,
  visitor_id text not null,
  name text,
  plays bigint not null,
  secs double precision not null,
  primary key (game_id, visitor_id)
);
create index if not exists analytics_visitor_games_visitor_idx on public.analytics_visitor_games (visitor_id);

-- Only the functions below read or write these.
alter table public.analytics_visitors enable row level security;
alter table public.analytics_visitor_traits enable row level security;
alter table public.analytics_quarters enable row level security;
alter table public.analytics_visitor_users enable row level security;
alter table public.analytics_visitor_games enable row level security;
revoke all on public.analytics_visitors, public.analytics_visitor_traits, public.analytics_quarters,
  public.analytics_visitor_users, public.analytics_visitor_games from anon, authenticated;


-- Adds some events, by id, to the totals. All five tables in one statement so
-- the events are read once. Rows go in key order so two inserts that touch
-- the same totals wait for each other instead of deadlocking.
create or replace function public.analytics_roll_add(p_ids bigint[])
returns void
language sql
security definer
set search_path to 'public'
as $function$
  with e as materialized (
    select * from analytics_events where id = any(p_ids)
  ),
  visitors as (
    insert into analytics_visitors as v (visitor_id, first_ts, last_ts, first_act)
    select e.visitor_id, min(e.ts), max(e.ts), min(e.ts) filter (where analytics_is_action(e.event))
    from e
    group by 1 order by 1
    on conflict (visitor_id) do update set
      first_ts = least(v.first_ts, excluded.first_ts),
      last_ts = greatest(v.last_ts, excluded.last_ts),
      first_act = least(v.first_act, excluded.first_act)
  ),
  traits as (
    insert into analytics_visitor_traits as t (visitor_id, trait, value, n)
    select e.visitor_id, x.trait, x.value, count(*)
    from e, lateral (values ('tz', e.tz), ('viewport', e.viewport)) x (trait, value)
    where x.value is not null
    group by 1, 2, 3 order by 1, 2, 3
    on conflict (visitor_id, trait, value) do update set n = t.n + excluded.n
  ),
  quarters as (
    insert into analytics_quarters as q (bucket, visitor_id, session_id, events, pageviews, plays, play_secs, is_new)
    select date_bin('15 minutes', e.ts, timestamptz '2000-01-01 00:00:00+00'), e.visitor_id, e.session_id,
           count(*),
           count(*) filter (where e.event = 'pageview'),
           count(*) filter (where e.event = 'game_open'),
           coalesce(sum(e.value) filter (where e.event = 'game_close'), 0),
           bool_or(e.is_new)
    from e
    group by 1, 2, 3 order by 1, 2, 3
    on conflict (bucket, visitor_id, session_id) do update set
      events = q.events + excluded.events,
      pageviews = q.pageviews + excluded.pageviews,
      plays = q.plays + excluded.plays,
      play_secs = q.play_secs + excluded.play_secs,
      is_new = q.is_new or excluded.is_new
  ),
  users as (
    insert into analytics_visitor_users (visitor_id, user_id)
    select distinct e.visitor_id, e.user_id
    from e
    where e.user_id is not null
    order by 1, 2
    on conflict do nothing
  ),
  games as (
    insert into analytics_visitor_games as g (game_id, visitor_id, name, plays, secs)
    select e.game_id, e.visitor_id, max(e.item_title),
           count(*) filter (where e.event = 'game_open'),
           coalesce(sum(e.value) filter (where e.event = 'game_close'), 0)
    from e
    where e.game_id is not null
    group by 1, 2 order by 1, 2
    on conflict (game_id, visitor_id) do update set
      name = greatest(g.name, excluded.name),
      plays = g.plays + excluded.plays,
      secs = g.secs + excluded.secs
  )
  select;
$function$;

revoke all on function public.analytics_roll_add(bigint[]) from public, anon, authenticated;


-- Works the totals out again from the events, for some visitors or, given
-- null, for everyone. Inserts wait while it runs so none is counted twice.
create or replace function public.analytics_roll_redo(p_visitors text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  lock table analytics_events in share row exclusive mode;
  delete from analytics_visitors where p_visitors is null or visitor_id = any(p_visitors);
  delete from analytics_visitor_traits where p_visitors is null or visitor_id = any(p_visitors);
  delete from analytics_quarters where p_visitors is null or visitor_id = any(p_visitors);
  delete from analytics_visitor_users where p_visitors is null or visitor_id = any(p_visitors);
  delete from analytics_visitor_games where p_visitors is null or visitor_id = any(p_visitors);
  perform analytics_roll_add(array(
    select id from analytics_events where p_visitors is null or visitor_id = any(p_visitors)
  ));
end;
$function$;

revoke all on function public.analytics_roll_redo(text[]) from public, anon, authenticated;


create or replace function public.analytics_roll_inserted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform analytics_roll_add(array(select id from new_rows));
  return null;
end;
$function$;

create or replace function public.analytics_roll_changed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_visitors text[];
begin
  if tg_op = 'UPDATE' then
    v_visitors := array(select visitor_id from old_rows union select visitor_id from new_rows);
  else
    v_visitors := array(select distinct visitor_id from old_rows);
  end if;
  if cardinality(v_visitors) > 0 then
    perform analytics_roll_redo(v_visitors);
  end if;
  return null;
end;
$function$;

revoke all on function public.analytics_roll_inserted() from public, anon, authenticated;
revoke all on function public.analytics_roll_changed() from public, anon, authenticated;

create or replace trigger analytics_roll_insert
  after insert on public.analytics_events
  referencing new table as new_rows
  for each statement execute function public.analytics_roll_inserted();

create or replace trigger analytics_roll_delete
  after delete on public.analytics_events
  referencing old table as old_rows
  for each statement execute function public.analytics_roll_changed();

create or replace trigger analytics_roll_update
  after update on public.analytics_events
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.analytics_roll_changed();

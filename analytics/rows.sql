-- The dashboard's events, in slices it can ask for side by side, and the
-- newest ones as they arrive for the live view.
--
-- analytics_fetch handed rows over 1000 at a time, one request after
-- another, and worked out the scanners again for each one: ten seconds for a
-- day, most of a minute for a month. Now the dashboard asks how far a range
-- reaches in ids, asks for slices of it a few at a time, and from then on
-- only asks for what came in since.
--
-- Scanners come back with the rows instead of being left out, flagged by
-- visitor id. Whether a visitor is a scanner only changes when they send
-- something new, so the dashboard can keep rows it already has and still
-- leave out the right people.
--
-- Apply against project dxwjxzmlezfyursysays, after analytics/rollups.sql.
-- Every statement is safe to run twice.


-- How far back from p_from the ids go, and the database's own clock.
create or replace function public.analytics_span(p_secret text, p_from timestamptz)
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

  return json_build_object(
    'now', now(),
    'min_id', (select min(f.id) from (
                 select id from analytics_events where ts >= p_from order by ts limit 1000
               ) f),
    'max_id', (select max(id) from analytics_events)
  );
end;
$function$;


-- One event as a list in this order:
--
--   id, ts (ms), event, visitor_id, session_id, user_id, path, referrer,
--   game_id, item_id, item_title, value, meta, browser, os, device, screen,
--   viewport, lang, tz, utm_source, utm_medium, utm_campaign, is_new,
--   client_ts (ms), origin
--
-- which is about half the size of an object per row. analytics_rows and
-- the live channel (analytics/live.sql) both send events this way.
create or replace function public.analytics_row_list(e analytics_events)
returns json
language sql
immutable
set search_path to 'public'
as $function$
  select json_build_array(
    e.id, round(extract(epoch from e.ts) * 1000), e.event, e.visitor_id, e.session_id, e.user_id,
    e.path, e.referrer, e.game_id, e.item_id, e.item_title, e.value, e.meta,
    e.browser, e.os, e.device, e.screen, e.viewport, e.lang, e.tz,
    e.utm_source, e.utm_medium, e.utm_campaign, e.is_new,
    round(extract(epoch from e.client_ts) * 1000), e.origin
  );
$function$;

revoke all on function public.analytics_row_list(analytics_events) from public, anon, authenticated;


-- Events from p_from on, oldest id first, at most 5000: the ids from p_lo to
-- p_hi when they are given, each as analytics_row_list makes it. now is
-- when the rows were read: anything not in them started after now less a
-- few seconds, since Supabase stops an insert after 3. scanners lists the
-- visitors in these rows that analytics_scanners leaves out right now.
--
-- Run through execute so each call is planned for its own range: a plan
-- kept from a call for the last few seconds would read the whole table in
-- id order for a month, and the other way round.
create or replace function public.analytics_rows(
  p_secret text,
  p_from timestamptz,
  p_lo bigint default null,
  p_hi bigint default null
) returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_out json;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  execute $q$
    with r as materialized (
      select * from analytics_events e
      where e.ts >= $1
        and ($2::bigint is null or e.id >= $2)
        and ($3::bigint is null or e.id <= $3)
      order by e.id
      limit 5000
    )
    select json_build_object(
      'now', now(),
      'rows', coalesce((select json_agg(analytics_row_list(r) order by r.id) from r), '[]'::json),
      'scanners', coalesce((select json_agg(s.visitor_id) from analytics_scanners() s
        where s.visitor_id in (select r.visitor_id from r)), '[]'::json)
    )
  $q$ into v_out using p_from, p_lo, p_hi;
  return v_out;
end;
$function$;

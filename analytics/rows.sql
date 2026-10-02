-- The dashboard's events, in slices it can ask for side by side, and the
-- newest ones as they arrive for the live view.
--
-- analytics_fetch handed rows over 1000 at a time, one request after
-- another, and worked out the scanners again for each one: ten seconds for a
-- day, most of a minute for a month. Now the dashboard asks how far a range
-- reaches in ids, asks for slices of it a few at a time, and from then on
-- only asks for what came in since.
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

  return (
    select json_build_object('now', now(), 'min_id', min(id), 'max_id', max(id), 'rows', count(*))
    from analytics_events
    where ts >= p_from
  );
end;
$function$;

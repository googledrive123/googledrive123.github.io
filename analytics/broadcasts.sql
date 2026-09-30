-- Broadcasts: a message from the site owner at the top of every page.
--
-- Sent from the analytics dashboard. Each one says who should see it:
--   now   - only people who have the site open when it is sent
--   later - only people who arrive after it is sent
--   both  - everyone
-- Pages poll gv_broadcasts about once a minute. Each browser tab remembers the
-- server time of its first poll as its arrival, which is what "now" and
-- "later" are measured against (see js/broadcast.js).
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 30 September 2026.

create table if not exists public.gv_announcements (
  id bigserial primary key,
  message text not null check (char_length(message) between 1 and 500),
  mode text not null default 'both' check (mode in ('now', 'later', 'both')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 day',
  stopped boolean not null default false
);

-- Everything goes through the functions below.
alter table public.gv_announcements enable row level security;


-- What a page needs: the server's clock (so arrival times never depend on the
-- visitor's own clock) and every broadcast still running.
create or replace function public.gv_broadcasts()
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

  return json_build_object(
    'now', now(),
    'items', coalesce((
      select json_agg(json_build_object('id', id, 'message', message, 'mode', mode, 'created_at', created_at) order by id)
      from gv_announcements
      where not stopped and expires_at > now()
    ), '[]'::json)
  );
end;
$function$;

grant execute on function public.gv_broadcasts() to anon, authenticated;


-- Owner only, behind the dashboard secret.
create or replace function public.gv_broadcast_send(p_secret text, p_message text, p_mode text, p_hours integer default 24)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row gv_announcements;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  insert into gv_announcements (message, mode, expires_at)
  values (btrim(p_message), coalesce(p_mode, 'both'),
          now() + make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 30)))
  returning * into v_row;

  return row_to_json(v_row);
end;
$function$;

create or replace function public.gv_broadcast_list(p_secret text)
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

  return coalesce((
    select json_agg(row_to_json(a) order by a.id desc)
    from (select * from gv_announcements order by id desc limit 50) a
  ), '[]'::json);
end;
$function$;

create or replace function public.gv_broadcast_stop(p_secret text, p_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  update gv_announcements set stopped = true where id = p_id;
  return found;
end;
$function$;

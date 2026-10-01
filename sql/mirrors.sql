-- Backup addresses.
--
-- The whole site also runs at other github.io addresses: forks of this repo
-- and of the vault repos that pull in every change once a day (see
-- .github/workflows/sync.yml and mirrors/SETUP.md). Schools block sites one
-- address at a time, so when one is blocked another usually still works.
--
-- The owner lists them from the dashboard, /mirrors/ shows them to everyone,
-- and every listed address passes the same origin check as the main site, so
-- sign-in, saves, rooms and the rest keep working there.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 30 September 2026.


-- origin is exactly what a browser sends in its Origin header: https, the
-- host, no port, no path and no trailing slash. Anything else would never
-- match a real request.
create table if not exists public.gv_mirrors (
  origin text primary key check (origin ~ '^https://[a-z0-9.-]+$'),
  label text check (label is null or char_length(label) between 1 and 60),
  active boolean not null default true,
  added_at timestamptz not null default now()
);

-- Every path in and out is a security definer function, so there is no
-- policy to write and a direct PostgREST request reads and writes nothing.
alter table public.gv_mirrors enable row level security;


-- Every origin the public functions answer, read by gv_origin_allowed() and
-- through it by nearly every public function and the analytics insert
-- policy. It used to be a fixed list and IMMUTABLE; it now reads gv_mirrors,
-- so it is STABLE, and security definer because the anon role cannot read
-- that table. Name, arguments and return type are unchanged.
create or replace function public.gv_allowed_origins()
returns text[]
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select array[
    'https://googledrive123.github.io',
    'http://127.0.0.1:8000',
    'http://localhost:8000'
  ] || coalesce((select array_agg(m.origin order by m.origin) from gv_mirrors m where m.active), '{}'::text[]);
$function$;


-- What /mirrors/ lists, oldest first. The main site is not in the table; the
-- page adds it itself.
create or replace function public.gv_mirrors_list()
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
    select json_agg(json_build_object('origin', origin, 'label', label) order by added_at, origin)
    from gv_mirrors
    where active
  ), '[]'::json);
end;
$function$;

grant execute on function public.gv_mirrors_list() to anon, authenticated;


-- Owner only, behind the dashboard secret. Takes an address as it is usually
-- copied, "name.github.io" or "https://name.github.io/", and stores the bare
-- origin. Adding one that is already there renames it and turns it back on.
create or replace function public.gv_mirror_add(p_secret text, p_origin text, p_label text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_origin text := regexp_replace(lower(btrim(coalesce(p_origin, ''))), '/+$', '');
  v_row gv_mirrors;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  if v_origin !~ '^[a-z]+://' then
    v_origin := 'https://' || v_origin;
  end if;
  if v_origin !~ '^https://[a-z0-9.-]+$' then
    raise exception 'give an https address with no path, like https://name.github.io';
  end if;
  if v_origin = 'https://googledrive123.github.io' then
    raise exception 'that is the main site';
  end if;

  insert into gv_mirrors (origin, label)
  values (v_origin, nullif(left(btrim(coalesce(p_label, '')), 60), ''))
  on conflict (origin) do update set label = excluded.label, active = true
  returning * into v_row;

  return row_to_json(v_row);
end;
$function$;

create or replace function public.gv_mirror_remove(p_secret text, p_origin text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_origin text := regexp_replace(lower(btrim(coalesce(p_origin, ''))), '/+$', '');
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  if v_origin !~ '^[a-z]+://' then
    v_origin := 'https://' || v_origin;
  end if;
  delete from gv_mirrors where origin = v_origin;
  return found;
end;
$function$;

-- Broken link reports from the 404 page.
--
-- "Report this broken link" sends the address that failed, where the visitor
-- came from and their visitor id. The dashboard lists open reports grouped by
-- address and marks them fixed.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 30 September 2026.

create table if not exists public.gv_link_reports (
  id bigserial primary key,
  path text not null,
  referrer text,
  visitor_id text,
  created_at timestamptz not null default now(),
  fixed_at timestamptz
);

create index if not exists gv_link_reports_open_idx on public.gv_link_reports (path) where fixed_at is null;

-- Written and read only through the functions below.
alter table public.gv_link_reports enable row level security;


-- At most five reports an hour from one visitor, and one per address per day.
create or replace function public.gv_report_link(p_path text, p_referrer text, p_visitor_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_path text := left(btrim(coalesce(p_path, '')), 300);
  v_visitor text := left(nullif(btrim(coalesce(p_visitor_id, '')), ''), 64);
begin
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;
  if v_path = '' then
    return false;
  end if;
  if v_visitor is not null and (
       (select count(*) from gv_link_reports
         where visitor_id = v_visitor and created_at > now() - interval '1 hour') >= 5
    or exists (select 1 from gv_link_reports
         where visitor_id = v_visitor and path = v_path and created_at > now() - interval '1 day')
  ) then
    return true;
  end if;

  insert into gv_link_reports (path, referrer, visitor_id)
  values (v_path, left(nullif(btrim(coalesce(p_referrer, '')), ''), 300), v_visitor);
  return true;
end;
$function$;

grant execute on function public.gv_report_link(text, text, text) to anon, authenticated;


-- Owner only: open reports, one row per address.
create or replace function public.gv_link_reports_list(p_secret text)
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
    select json_agg(r order by r.reports desc, r.last_seen desc)
    from (
      select path,
             count(*) as reports,
             min(created_at) as first_seen,
             max(created_at) as last_seen,
             (array_agg(distinct referrer) filter (where referrer is not null))[1:3] as referrers
      from gv_link_reports
      where fixed_at is null
      group by path
    ) r
  ), '[]'::json);
end;
$function$;

create or replace function public.gv_link_reports_fix(p_secret text, p_path text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n integer;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  update gv_link_reports set fixed_at = now() where path = p_path and fixed_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

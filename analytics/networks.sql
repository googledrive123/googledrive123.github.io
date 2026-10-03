-- Which networks people play from, to see how many come from each school.
-- A school's computers reach the internet through the school's or the
-- district's own public address, so an address several visitors share is a
-- school or another shared network. The dashboard looks each shared address
-- up, and the owner can name it.
--
-- Only the owner's secret reads any of this. The dashboard lists an address
-- only once at least 3 visitors share it, so nobody's home address is shown.
--
-- Apply against project dxwjxzmlezfyursysays, after analytics/rollups.sql.
-- Every statement is safe to run twice.


-- Each visitor's addresses, and when they were seen on each.
create table if not exists public.analytics_visitor_ips (
  visitor_id text not null,
  ip         inet not null,
  first_ts   timestamptz not null default now(),
  last_ts    timestamptz not null default now(),
  hits       integer not null default 1,
  primary key (visitor_id, ip)
);

create index if not exists analytics_visitor_ips_recent on public.analytics_visitor_ips (last_ts);

alter table public.analytics_visitor_ips enable row level security;
revoke all on table public.analytics_visitor_ips from anon, authenticated;


-- The address a request came from: Cloudflare's own header, or the first
-- hop of x-forwarded-for.
create or replace function public.analytics_request_ip()
returns inet
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  h json := nullif(current_setting('request.headers', true), '')::json;
begin
  return coalesce(nullif(h ->> 'cf-connecting-ip', ''),
                  nullif(btrim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''))::inet;
exception when others then
  return null;
end;
$function$;

revoke all on function public.analytics_request_ip() from public, anon, authenticated;

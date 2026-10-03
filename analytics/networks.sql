-- Which networks people play from, to see how many come from each school.
-- A school's computers reach the internet through the school's or the
-- district's own public address, so an address several visitors share is a
-- school or another shared network. The dashboard looks each shared address
-- up, and the owner can name it.
--
-- Only the owner's secret reads any of this. The dashboard lists an address
-- only once at least 3 visitors share it, so nobody's home address is shown.
-- Addresses not seen for 90 days are forgotten.
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


-- What the dashboard found out about a shared address, and what the owner
-- calls it.
create table if not exists public.analytics_networks (
  ip        inet primary key,
  -- Who the address is registered to, like a school district.
  owner     text,
  -- The network it is on, like an internet provider.
  provider  text,
  city      text,
  region    text,
  looked_up timestamptz,
  label     text
);

alter table public.analytics_networks enable row level security;
revoke all on table public.analytics_networks from anon, authenticated;


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


-- Notes the address of every visitor in an insert. It never stops the
-- insert: losing an address is fine, losing events is not.
create or replace function public.analytics_note_ip()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ip inet := public.analytics_request_ip();
begin
  if v_ip is not null then
    insert into analytics_visitor_ips as a (visitor_id, ip)
    select distinct n.visitor_id, v_ip from new_rows n where n.visitor_id is not null
    on conflict (visitor_id, ip) do update set last_ts = now(), hits = a.hits + 1;
    -- Now and then, forget the addresses not seen for 90 days.
    if random() < 0.01 then
      delete from analytics_visitor_ips where last_ts < now() - interval '90 days';
    end if;
  end if;
  return null;
exception when others then
  return null;
end;
$function$;

drop trigger if exists analytics_note_ip on public.analytics_events;
create trigger analytics_note_ip
  after insert on public.analytics_events
  referencing new table as new_rows
  for each statement execute function public.analytics_note_ip();


-- People by network over the last p_days days, scanners left out:
--   people     everyone seen on any address
--   named      each name the owner gave, with how many people use it
--   unnamed    people on shared addresses that have no name yet
--   only_home  people never seen on a shared address (home, phones)
--   networks   every address at least p_min visitors share, busiest first
--   your_ip    the address this request came from, to mark the owner's own
create or replace function public.analytics_networks_list(p_secret text, p_days integer default 30, p_min integer default 3)
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
    with s as materialized (select visitor_id from analytics_scanners()),
    seen as materialized (
      select a.visitor_id, a.ip
        from analytics_visitor_ips a
       where a.last_ts >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
         and not exists (select 1 from s where s.visitor_id = a.visitor_id)
    ),
    shared as materialized (
      select ip, count(distinct visitor_id) as people
        from seen
       group by ip
      having count(distinct visitor_id) >= greatest(coalesce(p_min, 3), 2)
    ),
    tagged as materialized (
      select se.visitor_id, sh.ip is not null as on_shared, nullif(btrim(n.label), '') as label
        from seen se
        left join shared sh on sh.ip = se.ip
        left join analytics_networks n on n.ip = sh.ip
    )
    select json_build_object(
      'people', (select count(distinct visitor_id) from seen),
      'named', coalesce((
        select json_agg(json_build_object('label', x.label, 'people', x.people) order by x.people desc)
          from (select label, count(distinct visitor_id) as people
                  from tagged where on_shared and label is not null group by label) x
      ), '[]'::json),
      'unnamed', (select count(distinct visitor_id) from tagged where on_shared and label is null),
      'only_home', (select count(*) from (select visitor_id from tagged group by visitor_id
                                           having not bool_or(on_shared)) h),
      'networks', coalesce((
        select json_agg(json_build_object(
                 'ip', host(sh.ip),
                 'people', sh.people,
                 'owner', n.owner,
                 'provider', n.provider,
                 'city', n.city,
                 'region', n.region,
                 'label', n.label,
                 'looked_up', n.looked_up is not null
               ) order by sh.people desc, sh.ip)
          from shared sh
          left join analytics_networks n on n.ip = sh.ip
      ), '[]'::json),
      'your_ip', host(public.analytics_request_ip())
    )
  );
end;
$function$;


-- Keeps what the dashboard looked up about an address.
create or replace function public.analytics_network_found(p_secret text, p_ip text, p_owner text, p_provider text, p_city text, p_region text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;
  insert into analytics_networks (ip, owner, provider, city, region, looked_up)
  values (p_ip::inet,
          left(nullif(btrim(p_owner), ''), 120),
          left(nullif(btrim(p_provider), ''), 120),
          left(nullif(btrim(p_city), ''), 80),
          left(nullif(btrim(p_region), ''), 80),
          now())
  on conflict (ip) do update
    set owner = excluded.owner, provider = excluded.provider,
        city = excluded.city, region = excluded.region, looked_up = now();
  return true;
end;
$function$;

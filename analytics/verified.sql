-- Verified players.
--
-- A blue check the site owner hands out from the analytics dashboard, for the
-- players GameVault picks out as its top ones. It shows next to their name on
-- the site and on the PolyTrack leaderboards.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice.


-- key is the same thing polytrack_scores calls player_key: an account's user
-- id, or 'guest:' and the browser's visitor id for someone who never signed
-- in. Using the board's own key is what lets the board mark a row without
-- having to work out who it belongs to.
--
-- name is only what the dashboard showed when the check was given, so a
-- player who has since vanished from both lists can still be found to remove.
create table if not exists public.gv_verified (
  key text primary key,
  name text,
  verified_at timestamptz not null default now()
);

-- Every path in and out is a security definer function, so there is no
-- policy to write and a direct PostgREST request reads and writes nothing.
alter table public.gv_verified enable row level security;


-- Everyone the dashboard can hand a check to: every account by its username,
-- and every guest who has a name on a PolyTrack board. A guest with no times
-- has no name anywhere, so there is nothing to search them by.
--
-- Anyone already verified is included even if they are on neither list any
-- more, so a check can always be taken back.
--
-- Behind the dashboard secret, like the rest of the analytics functions: the
-- list carries account ids and visitor ids.
create or replace function public.gv_verify_candidates(p_secret text)
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
    with accounts as (
      select p.id::text as key,
             coalesce(nullif(btrim(p.username), ''), 'Account ' || left(p.id::text, 8)) as name,
             'account'::text as kind
      from profiles p
    ), guests as (
      select distinct on (s.player_key)
             s.player_key as key, s.nickname as name, 'guest'::text as kind
      from polytrack_scores s
      where s.user_id is null
      order by s.player_key, s.updated_at desc
    ), everyone as (
      select * from accounts
      union all
      select * from guests
      union all
      select v.key,
             coalesce(v.name, v.key),
             case when v.key like 'guest:%' then 'guest' else 'account' end
      from gv_verified v
      where not exists (select 1 from accounts a where a.key = v.key)
        and not exists (select 1 from guests g where g.key = v.key)
    )
    select json_agg(json_build_object(
             'key', e.key,
             'name', e.name,
             'kind', e.kind,
             'verified', v.key is not null,
             'verified_at', v.verified_at
           ) order by (v.key is null), lower(e.name))
    from everyone e
    left join gv_verified v on v.key = e.key
  ), '[]'::json);
end;
$function$;


-- Gives or takes back a check. Giving one twice keeps the first date, so the
-- message a player sees once is not shown to them again for a repeat click.
create or replace function public.gv_verify_set(
  p_secret text,
  p_key text,
  p_verified boolean,
  p_name text default null
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;
  if p_key is null or char_length(p_key) not between 1 and 128 then
    raise exception 'invalid key';
  end if;

  if coalesce(p_verified, false) then
    insert into gv_verified (key, name)
    values (p_key, left(nullif(btrim(coalesce(p_name, '')), ''), 50))
    on conflict (key) do update
      set name = coalesce(excluded.name, gv_verified.name);
  else
    delete from gv_verified where key = p_key;
  end if;

  return coalesce(p_verified, false);
end;
$function$;


-- Asked by the site and by PolyTrack on the player's own behalf. A signed-in
-- player is looked up by their account, and by the browser they are on in
-- case the check was given to them as a guest before they signed up.
--
-- Returns null for anyone not verified, otherwise when the check was given,
-- which the pages use to tell the player once and only once.
create or replace function public.gv_verified_status(p_visitor_id text default null)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_found timestamptz;
begin
  if not public.gv_origin_allowed() then
    raise exception 'verification is not read from this origin';
  end if;

  select min(verified_at) into v_found
  from gv_verified
  where key = v_user::text
     or key = 'guest:' || nullif(btrim(coalesce(p_visitor_id, '')), '');

  if v_found is null then
    return null;
  end if;
  return json_build_object('verified_at', v_found);
end;
$function$;

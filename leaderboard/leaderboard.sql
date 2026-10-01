-- Play time leaderboards for /leaderboard/.
--
-- Every game session a signed-in account finishes is a play_sessions row,
-- written by the browser, so the boards only trust what cannot be stretched:
--   * only finished sessions that ended in the past and started no more than
--     60 days before the account was made (guest play from this browser is
--     sent up at sign-up, and some of it is weeks old);
--   * one session counts for at most four hours, so a tab left open
--     overnight does not top the board;
--   * sessions that overlap are merged, so an account can never count more
--     time than really passed (saving a session twice counts it once).
-- The level on the profile (index.html) counts play time the same way, so the
-- two agree. Guests keep their sessions in their own browser and are not on
-- the boards.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 1 October 2026.


-- Each counted session as a time range, at most four hours long, cut to start
-- no earlier than p_since. Only accounts that still exist, and one game when
-- p_game_id is given.
create or replace function public.gv_play_ranges(p_since timestamptz default null, p_game_id text default null)
returns table (user_id uuid, game_id text, r tstzrange)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.user_id,
         s.game_id,
         tstzrange(greatest(s.started_at, coalesce(p_since, s.started_at)),
                   least(s.ended_at, s.started_at + interval '4 hours'))
  from play_sessions s
  join auth.users u on u.id = s.user_id
  where s.ended_at is not null
    and s.ended_at <= now()
    and s.started_at < s.ended_at
    and s.started_at >= u.created_at - interval '60 days'
    and (p_game_id is null or s.game_id = p_game_id)
    and (p_since is null or least(s.ended_at, s.started_at + interval '4 hours') > p_since)
$function$;

revoke all on function public.gv_play_ranges(timestamptz, text) from public, anon, authenticated;

-- Seconds covered by a set of merged time ranges.
create or replace function public.gv_span_seconds(p tstzmultirange)
returns bigint
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(sum(extract(epoch from upper(x) - lower(x))), 0)::bigint from unnest(p) as x
$function$;


-- "Hide me from the leaderboard" on the profile. Accounts start shown. The
-- account can still see its own standing; nobody else sees it.
alter table public.profiles add column if not exists hide_on_boards boolean not null default false;

-- Accounts the owner took off the boards. Sessions come from the browser, so
-- a forged time is possible; this is the way to take it down. Players cannot
-- write here (unlike profiles).
create table if not exists public.gv_board_bans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.gv_board_bans enable row level security;
revoke all on table public.gv_board_bans from anon, authenticated;

-- Everyone kept off the boards, by their choice or the owner's.
create or replace function public.gv_board_hidden(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = p_user and hide_on_boards)
      or exists (select 1 from gv_board_bans where user_id = p_user)
$function$;

revoke all on function public.gv_board_hidden(uuid) from public, anon, authenticated;


-- The boards are worked out at most once a minute and kept here, so a busy
-- page (or someone calling the function in a loop) does not re-read every
-- session each time. ranks holds every ranked account, for "where you stand".
create table if not exists public.gv_leaderboard_cache (
  id integer primary key check (id = 1),
  boards json not null,
  ranks json not null,
  made_at timestamptz not null
);

alter table public.gv_leaderboard_cache enable row level security;
revoke all on table public.gv_leaderboard_cache from anon, authenticated;


-- What /leaderboard/ shows: the top 50 accounts by play time (the level comes
-- from play time, so this is the level board too), the top 20 this week, and
-- the 100 most played games with each one's top player. Signed in, it also
-- says where the caller stands. Names and pictures come from
-- gv_public_profiles.
create or replace function public.gv_leaderboard()
returns json
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_me    uuid := auth.uid();
  v_cache gv_leaderboard_cache;
begin
  if not public.gv_origin_allowed() then
    raise exception 'not read from this origin';
  end if;

  select * into v_cache from gv_leaderboard_cache where id = 1;
  -- One caller rebuilds a stale board; the rest read the one there is.
  if (not found or v_cache.made_at < now() - interval '1 minute')
     and pg_try_advisory_xact_lock(hashtext('gv_leaderboard')) then
    with c as (
      select * from gv_play_ranges() p where not gv_board_hidden(p.user_id)
    ),
    per_user as (
      select user_id, gv_span_seconds(range_agg(r)) as sec, count(distinct game_id) as games
      from c group by user_id
    ),
    ranked as (
      select *, rank() over (order by sec desc) as rank from per_user where sec > 0
    ),
    per_game_user as (
      select game_id, user_id, gv_span_seconds(range_agg(r)) as sec from c group by game_id, user_id
    ),
    top_player as (
      select distinct on (game_id) game_id, user_id, sec
      from per_game_user
      order by game_id, sec desc, user_id
    ),
    per_game as (
      select game_id, sum(sec)::bigint as sec, count(*) as players
      from per_game_user group by game_id
    ),
    week as (
      select user_id, gv_span_seconds(range_agg(r * tstzrange(now() - interval '7 days', null))) as sec
      from c where upper(r) > now() - interval '7 days'
      group by user_id
    )
    insert into gv_leaderboard_cache (id, boards, ranks, made_at)
    select 1,
      json_build_object(
        'players', coalesce((
          select json_agg(json_build_object('id', r.user_id, 'sec', r.sec, 'games', r.games, 'rank', r.rank)
                          order by r.sec desc, r.user_id)
          from (select * from ranked order by sec desc, user_id limit 50) r
        ), '[]'::json),
        'week', coalesce((
          select json_agg(json_build_object('id', x.user_id, 'sec', x.sec) order by x.sec desc, x.user_id)
          from (select * from week where sec > 0 order by sec desc, user_id limit 20) x
        ), '[]'::json),
        'games', coalesce((
          select json_agg(json_build_object('id', g.game_id, 'sec', g.sec, 'players', g.players,
                                            'rank', g.rank, 'top', t.user_id, 'top_sec', t.sec)
                          order by g.sec desc, g.game_id)
          from (select *, rank() over (order by sec desc) as rank from per_game
                where sec > 0 order by sec desc, game_id limit 100) g
          join top_player t on t.game_id = g.game_id
        ), '[]'::json)
      ),
      coalesce((
        select json_object_agg(r.user_id, json_build_array(r.rank, r.sec, r.games))
        from ranked r
      ), '{}'::json),
      now()
    on conflict (id) do update
      set boards = excluded.boards, ranks = excluded.ranks, made_at = excluded.made_at
    returning * into v_cache;
  end if;

  -- Only on the very first call, while another caller is still building it.
  if v_cache.id is null then
    raise exception 'the leaderboard is being worked out, try again in a moment';
  end if;

  return json_build_object(
    'players', v_cache.boards->'players',
    'week', v_cache.boards->'week',
    'games', v_cache.boards->'games',
    'of', (select count(*) from json_object_keys(v_cache.ranks)),
    'me', case
      when v_me is null then null
      when gv_board_hidden(v_me) then json_build_object('id', v_me, 'hidden', true)
      when v_cache.ranks->(v_me::text) is null then null
      else json_build_object('id', v_me,
                             'rank', (v_cache.ranks->(v_me::text)->>0)::integer,
                             'sec', (v_cache.ranks->(v_me::text)->>1)::bigint,
                             'games', (v_cache.ranks->(v_me::text)->>2)::integer)
    end
  );
end;
$function$;

grant execute on function public.gv_leaderboard() to anon, authenticated;


-- One game's top ten accounts by play time.
create or replace function public.gv_leaderboard_game(p_game_id text)
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
    select json_agg(json_build_object('id', x.user_id, 'sec', x.sec, 'rank', x.rank) order by x.sec desc, x.user_id)
    from (
      select user_id, sec, rank() over (order by sec desc) as rank
      from (
        select user_id, gv_span_seconds(range_agg(r)) as sec
        from gv_play_ranges(null, left(coalesce(p_game_id, ''), 120))
        where not gv_board_hidden(user_id)
        group by user_id
      ) t
      where sec > 0
      order by sec desc, user_id
      limit 10
    ) x
  ), '[]'::json);
end;
$function$;

grant execute on function public.gv_leaderboard_game(text) to anon, authenticated;

drop function if exists public.gv_play_counted(timestamptz);


-- Owner only: take an account off the boards, or put it back.
create or replace function public.gv_board_ban(p_secret text, p_user uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;
  if p_on then
    insert into gv_board_bans (user_id) values (p_user) on conflict do nothing;
  else
    delete from gv_board_bans where user_id = p_user;
  end if;
  -- The next visit rebuilds the boards without (or with) them.
  update gv_leaderboard_cache set made_at = '-infinity' where id = 1;
  return p_on;
end;
$function$;

grant execute on function public.gv_board_ban(text, uuid, boolean) to anon, authenticated;

-- Owner only: who is off the boards.
create or replace function public.gv_board_bans_list(p_secret text)
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
  return coalesce((select json_agg(json_build_object('id', user_id, 'at', created_at) order by created_at desc)
                   from gv_board_bans), '[]'::json);
end;
$function$;

grant execute on function public.gv_board_bans_list(text) to anon, authenticated;

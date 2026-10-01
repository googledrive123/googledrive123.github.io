-- Play time leaderboards for /leaderboard/.
--
-- Every game session a signed-in account finishes is a play_sessions row.
-- Two rules keep the boards fair:
--   * a session saved twice (same account, game and start time) counts once;
--   * one session counts for at most four hours, so a tab left open
--     overnight does not top the board.
-- The level on the profile (index.html) counts play time the same way, so the
-- two always agree. Guests keep their sessions in their own browser and are
-- not on the boards.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 1 October 2026.


-- Each counted session: one row per account, game and start time, at most
-- four hours long. Only accounts that still exist.
create or replace function public.gv_play_counted(p_since timestamptz default null)
returns table (user_id uuid, game_id text, sec integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select distinct on (s.user_id, s.game_id, s.started_at)
         s.user_id,
         s.game_id,
         least(greatest(coalesce(s.duration_seconds,
                                 extract(epoch from s.ended_at - s.started_at)::integer,
                                 0), 0), 4 * 3600)
  from play_sessions s
  join auth.users u on u.id = s.user_id
  where p_since is null or s.started_at >= p_since
  order by s.user_id, s.game_id, s.started_at, s.id
$function$;

revoke all on function public.gv_play_counted(timestamptz) from public, anon, authenticated;


-- What /leaderboard/ shows: the top 50 accounts by play time (the level comes
-- from play time, so this is the level board too), the top 20 this week, and
-- the 100 most played games with each one's top player. Signed in, it also
-- says where the caller stands. Names and pictures come from
-- gv_public_profiles.
create or replace function public.gv_leaderboard()
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
begin
  if not public.gv_origin_allowed() then
    raise exception 'not read from this origin';
  end if;

  return (
    with c as (select * from gv_play_counted()),
    w as (select * from gv_play_counted(now() - interval '7 days')),
    per_user as (
      select user_id, sum(sec)::bigint as sec, count(distinct game_id) as games
      from c group by user_id
    ),
    ranked as (
      select *, rank() over (order by sec desc) as rank from per_user
    ),
    per_game_user as (
      select game_id, user_id, sum(sec)::bigint as sec from c group by game_id, user_id
    ),
    top_player as (
      select distinct on (game_id) game_id, user_id, sec
      from per_game_user
      order by game_id, sec desc, user_id
    ),
    per_game as (
      select game_id, sum(sec)::bigint as sec, count(*) as players
      from per_game_user group by game_id
    )
    select json_build_object(
      'players', coalesce((
        select json_agg(json_build_object('id', r.user_id, 'sec', r.sec, 'games', r.games, 'rank', r.rank)
                        order by r.sec desc, r.user_id)
        from (select * from ranked order by sec desc, user_id limit 50) r
      ), '[]'::json),
      'week', coalesce((
        select json_agg(json_build_object('id', x.user_id, 'sec', x.sec) order by x.sec desc, x.user_id)
        from (select user_id, sum(sec)::bigint as sec from w
              group by user_id order by sum(sec) desc, user_id limit 20) x
      ), '[]'::json),
      'games', coalesce((
        select json_agg(json_build_object('id', g.game_id, 'sec', g.sec, 'players', g.players,
                                          'top', t.user_id, 'top_sec', t.sec)
                        order by g.sec desc, g.game_id)
        from (select * from per_game order by sec desc, game_id limit 100) g
        join top_player t on t.game_id = g.game_id
      ), '[]'::json),
      'me', (
        select json_build_object('id', r.user_id, 'sec', r.sec, 'games', r.games, 'rank', r.rank,
                                 'of', (select count(*) from per_user))
        from ranked r where v_me is not null and r.user_id = v_me
      )
    )
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
    select json_agg(json_build_object('id', x.user_id, 'sec', x.sec) order by x.sec desc, x.user_id)
    from (
      select user_id, sum(sec)::bigint as sec
      from gv_play_counted()
      where game_id = left(coalesce(p_game_id, ''), 120)
      group by user_id
      order by sum(sec) desc, user_id
      limit 10
    ) x
  ), '[]'::json);
end;
$function$;

grant execute on function public.gv_leaderboard_game(text) to anon, authenticated;

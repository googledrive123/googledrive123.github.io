-- Play time leaderboards for /leaderboard/.
--
-- Every game session a signed-in account finishes is a play_sessions row,
-- written by the browser, so the boards only trust what cannot be stretched:
--   * only finished sessions that ended in the past and started after the
--     account was made;
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
    and s.started_at >= u.created_at
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

-- Monthly PolyTrack challenge.
--
-- Each month the site owner picks one PolyTrack track. Every run driven on it
-- during that month counts, straight from the site's PolyTrack leaderboard
-- (games/polytrack/leaderboard.sql), and once the month is over the owner
-- closes it from the analytics dashboard: first place gets the
-- challenge-winner badge, second and third get challenge-top3. The badge is
-- the whole prize. /challenge/ shows the month, /winner/ shows its winner.
--
-- Months run on UTC, so everyone has the same finish line.
--
-- Apply against project dxwjxzmlezfyursysays, after
-- games/polytrack/leaderboard.sql and sql/names.sql. Every statement is safe
-- to run twice. Applied on 30 September 2026.


-- One row per month, keyed by its first day.
create table if not exists public.gv_challenges (
  month     date primary key check (extract(day from month) = 1),
  track_id  text not null check (char_length(track_id) between 1 and 120),
  title     text not null check (char_length(title) between 1 and 80),
  note      text check (char_length(note) <= 300),
  -- When the badges were handed out. Empty until gv_challenge_close.
  closed_at timestamptz
);

-- Each player's best run on the month's track, during that month. The board
-- keeps a player's best ever, which can be older than the month; this keeps
-- the month's best alone. player_key is the board's own key: an account's
-- user id, or 'guest:' and the browser's visitor id.
create table if not exists public.gv_challenge_runs (
  month      date not null references public.gv_challenges (month) on delete cascade,
  track_id   text not null,
  player_key text not null,
  nickname   text not null,
  -- Deleting an account takes its runs with it, as it does its board times.
  user_id    uuid references auth.users (id) on delete cascade,
  frames     integer not null check (frames > 0),
  at         timestamptz not null default now(),
  primary key (month, player_key)
);

create index if not exists gv_challenge_runs_order
  on public.gv_challenge_runs (month, frames, at);

-- Badges, keyed the same way as the board so it can show them beside a time.
-- month is the challenge that earned the badge.
create table if not exists public.gv_badges (
  player_key text not null,
  badge      text not null check (badge ~ '^[a-z0-9-]{1,40}$'),
  month      date not null,
  -- So deleting an account takes its badges too. Empty for a guest.
  user_id    uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_key, badge, month)
);

-- Everything goes through the functions below, so there is no policy to
-- write and a direct PostgREST request reads and writes nothing.
alter table public.gv_challenges enable row level security;
alter table public.gv_challenge_runs enable row level security;
alter table public.gv_badges enable row level security;
revoke all on table public.gv_challenges, public.gv_challenge_runs, public.gv_badges from anon, authenticated;


-- This month, by UTC.
create or replace function public.gv_challenge_month()
returns date
language sql
stable
set search_path to 'public'
as $function$
  select date_trunc('month', now() at time zone 'utc')::date;
$function$;

revoke all on function public.gv_challenge_month() from public, anon, authenticated;

-- A time the way the game writes it. Frames are milliseconds.
create or replace function public.gv_challenge_time(p_frames integer)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select lpad((p_frames / 60000)::text, 2, '0') || ':'
      || lpad((p_frames / 1000 % 60)::text, 2, '0') || '.'
      || lpad((p_frames % 1000)::text, 3, '0');
$function$;

revoke all on function public.gv_challenge_time(integer) from public, anon, authenticated;

-- A month's runs in finishing order. A tie goes to whoever drove it first.
create or replace function public.gv_challenge_ranked(p_month date)
returns table (
  rank bigint, player_key text, nickname text, user_id uuid, frames integer, at timestamptz
)
language sql
stable
set search_path to 'public'
as $function$
  select row_number() over (order by r.frames, r.at, r.player_key),
         r.player_key, r.nickname, r.user_id, r.frames, r.at
  from gv_challenge_runs r
  where r.month = p_month;
$function$;

revoke all on function public.gv_challenge_ranked(date) from public, anon, authenticated;


-- Every run sent to the board passes through here on its way in.
--
-- It has to be BEFORE INSERT. polytrack_submit upserts, so by the time the
-- row is written, and so in any AFTER trigger, frames holds the player's best
-- ever, which can be a time from an earlier month. Only the proposed row
-- carries the time just driven, and BEFORE INSERT fires for every proposed
-- row, including the ones the upsert then turns into an update.
--
-- Triggers run in name order, so this one runs before gv_scores_name_guard
-- and does the same name check itself.
create or replace function public.gv_challenge_capture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key   text;
  v_month date;
begin
  v_key := coalesce(new.user_id::text, 'guest:' || new.visitor_id);
  v_month := gv_challenge_month();
  if v_key is null or coalesce(new.frames, 0) <= 0
     or not exists (select 1 from gv_challenges c
                    where c.month = v_month and c.track_id = new.track_id) then
    return new;
  end if;

  insert into gv_challenge_runs (month, track_id, player_key, nickname, user_id, frames)
  values (v_month, new.track_id, v_key,
          case when gv_name_rude(new.nickname) then 'Player'
               else coalesce(nullif(btrim(new.nickname), ''), 'Player') end,
          new.user_id, new.frames)
  on conflict (month, player_key) do update
    set nickname = excluded.nickname,
        frames   = least(excluded.frames, gv_challenge_runs.frames),
        at       = case when excluded.frames < gv_challenge_runs.frames
                        then excluded.at else gv_challenge_runs.at end;
  return new;
exception when others then
  -- The challenge must never cost a player their time on the board.
  return new;
end;
$function$;

revoke all on function public.gv_challenge_capture() from public, anon, authenticated;

drop trigger if exists gv_challenge_capture on public.polytrack_scores;
create trigger gv_challenge_capture
  before insert on public.polytrack_scores
  for each row execute function public.gv_challenge_capture();

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

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

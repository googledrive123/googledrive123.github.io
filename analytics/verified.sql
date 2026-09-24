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

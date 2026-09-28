-- Server side of the PolyTrack save kept on a GameVault account.
--
-- The game keeps its whole save in the browser: the profile with the car,
-- the best time and replay on every track, the tracks made in the editor,
-- the unlocked car parts, controls and settings. save.js copies those keys
-- here for a signed-in player and puts them back on any browser they sign in
-- on. One row per key, so a new best time sends one row and not the lot.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 28 September 2026.


create table if not exists public.polytrack_saves (
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  -- The value exactly as the game stored it. Null is a key the game removed,
  -- kept so the account's other browsers remove it too.
  value      text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- A browser that has pulled before only asks for what changed since.
create index if not exists polytrack_saves_user_updated
  on public.polytrack_saves (user_id, updated_at);

-- Read and written only through the two functions below.
alter table public.polytrack_saves enable row level security;
revoke all on table public.polytrack_saves from anon, authenticated;

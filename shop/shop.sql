-- Coins, crates and cosmetics.
--
-- Playing earns coins, coins open crates, and crates hold things that only
-- change how a player looks: a name color, a ring around the avatar, a color
-- for the game tiles and a title. Coins cannot be bought, there is no real
-- money anywhere, and nothing in a crate changes a game.
--
-- Coins come from play_sessions: one per full minute of a finished session,
-- at most 120 a day. The shop asks for them (gv_grant_coins) when it loads,
-- so nothing runs on a timer. The browser writes its own sessions, so the
-- daily cap and the three hour limit on one session are what keep a made-up
-- session from being worth much.
--
-- The roll reads the same gv_crate_tiers row that gv_crates shows, so the
-- chances on the page are the real ones.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 30 September 2026.


-- Everything a crate can hold. Ids are stable: inventories point at them.
create table if not exists public.gv_items (
  id text primary key,
  kind text not null check (kind in ('name_color', 'avatar_frame', 'tile_theme', 'title')),
  name text not null,
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  value jsonb not null default '{}'::jsonb
);

-- Every path in and out is a security definer function, so there is no
-- policy to write and a direct PostgREST request reads and writes nothing.
alter table public.gv_items enable row level security;

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

-- value by kind, as js/cosmetics.js reads it:
--   name_color    color, plus gradient (two colors) for the fancier ones
--   avatar_frame  ring (colors from the inside out, 2px each), optional glow
--   tile_theme    accent
--   title         text
-- Every rarity needs at least one item, or a roll that lands on it finds
-- nothing. Rerunning this updates the items in place.
insert into public.gv_items (id, kind, name, rarity, value) values
  ('color-ember',        'name_color',   'Ember',               'common',    '{"color": "#ff8a5c"}'),
  ('color-mint',         'name_color',   'Mint',                'common',    '{"color": "#5ce0a0"}'),
  ('color-sky',          'name_color',   'Sky',                 'common',    '{"color": "#6ab8ff"}'),
  ('color-lilac',        'name_color',   'Lilac',               'uncommon',  '{"color": "#b9a2ff"}'),
  ('color-sunflower',    'name_color',   'Sunflower',           'uncommon',  '{"color": "#ffd45c"}'),
  ('color-rose',         'name_color',   'Rose',                'rare',      '{"color": "#ff7ab6"}'),
  ('color-aurora',       'name_color',   'Aurora',              'epic',      '{"color": "#7af0d0", "gradient": ["#7af0d0", "#9b8cff"]}'),
  ('color-molten',       'name_color',   'Molten Gold',         'legendary', '{"color": "#ffc94a", "gradient": ["#ffe27a", "#ff8a3c"]}'),
  ('frame-line',         'avatar_frame', 'Thin Line',           'common',    '{"ring": ["#8a8a96"]}'),
  ('frame-mint',         'avatar_frame', 'Mint Ring',           'common',    '{"ring": ["#5ce0a0"]}'),
  ('frame-sky',          'avatar_frame', 'Sky Ring',            'uncommon',  '{"ring": ["#6ab8ff"]}'),
  ('frame-double',       'avatar_frame', 'Double Ring',         'uncommon',  '{"ring": ["#f4f4f6", "#08080a", "#f4f4f6"]}'),
  ('frame-sunset',       'avatar_frame', 'Sunset Ring',         'rare',      '{"ring": ["#ffd45c", "#ff6a3d"]}'),
  ('frame-neon',         'avatar_frame', 'Neon Glow',           'epic',      '{"ring": ["#7af0d0"], "glow": "#7af0d0"}'),
  ('frame-vault',        'avatar_frame', 'Vault Gold',          'legendary', '{"ring": ["#ffe27a", "#08080a", "#ffb13c"], "glow": "#ffb13c"}'),
  ('tiles-ocean',        'tile_theme',   'Ocean',               'common',    '{"accent": "#3aa0ff"}'),
  ('tiles-forest',       'tile_theme',   'Forest',              'common',    '{"accent": "#3ec77a"}'),
  ('tiles-grape',        'tile_theme',   'Grape',               'uncommon',  '{"accent": "#9b6bff"}'),
  ('tiles-dusk',         'tile_theme',   'Dusk',                'uncommon',  '{"accent": "#ff8a3c"}'),
  ('tiles-ice',          'tile_theme',   'Ice',                 'rare',      '{"accent": "#8fe3ff"}'),
  ('tiles-toxic',        'tile_theme',   'Toxic',               'epic',      '{"accent": "#b6ff3c"}'),
  ('tiles-gold',         'tile_theme',   'Gold Rush',           'legendary', '{"accent": "#ffc94a"}'),
  ('title-masher',       'title',        'Button Masher',       'common',    '{"text": "Button Masher"}'),
  ('title-night-owl',    'title',        'Night Owl',           'common',    '{"text": "Night Owl"}'),
  ('title-pixel-pusher', 'title',        'Pixel Pusher',        'uncommon',  '{"text": "Pixel Pusher"}'),
  ('title-high-scorer',  'title',        'High Scorer',         'uncommon',  '{"text": "High Scorer"}'),
  ('title-speedrunner',  'title',        'Speedrunner',         'rare',      '{"text": "Speedrunner"}'),
  ('title-completionist','title',        'Completionist',       'rare',      '{"text": "Completionist"}'),
  ('title-vault-keeper', 'title',        'Vault Keeper',        'epic',      '{"text": "Vault Keeper"}'),
  ('title-legend',       'title',        'Legend of the Vault', 'legendary', '{"text": "Legend of the Vault"}')
on conflict (id) do update
  set kind = excluded.kind, name = excluded.name,
      rarity = excluded.rarity, value = excluded.value;


-- The crates, with their chances in percent. They must add up to 100.
create table if not exists public.gv_crate_tiers (
  id text primary key,
  name text not null,
  price integer not null check (price > 0),
  sort integer not null default 0,
  common numeric(5, 2) not null,
  uncommon numeric(5, 2) not null,
  rare numeric(5, 2) not null,
  epic numeric(5, 2) not null,
  legendary numeric(5, 2) not null,
  check (common + uncommon + rare + epic + legendary = 100)
);

alter table public.gv_crate_tiers enable row level security;

-- At the 120 a day cap a common crate is under half an hour of play and a
-- legendary one is more than a week.
insert into public.gv_crate_tiers (id, name, price, sort, common, uncommon, rare, epic, legendary) values
  ('common',    'Common crate',      50, 1, 70, 22,  6, 1.8, 0.2),
  ('rare',      'Rare crate',       150, 2, 40, 35, 18, 6,   1),
  ('epic',      'Epic crate',       400, 3, 10, 30, 38, 18,  4),
  ('legendary', 'Legendary crate', 1000, 4,  0, 10, 40, 38, 12)
on conflict (id) do update
  set name = excluded.name, price = excluded.price, sort = excluded.sort,
      common = excluded.common, uncommon = excluded.uncommon, rare = excluded.rare,
      epic = excluded.epic, legendary = excluded.legendary;


-- One row per account, made the first time it earns or spends.
--
-- granted_through is the latest ended_at already paid out, so a session is
-- only ever counted once. earned_today and day hold the daily cap: a new day
-- starts earned_today from 0 again (UTC days).
create table if not exists public.gv_wallet (
  user_id uuid primary key references auth.users (id) on delete cascade,
  coins integer not null default 0 check (coins >= 0),
  granted_through timestamptz,
  earned_today integer not null default 0,
  day date
);

alter table public.gv_wallet enable row level security;

create table if not exists public.gv_inventory (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references public.gv_items (id),
  qty integer not null default 1 check (qty > 0),
  primary key (user_id, item_id)
);

alter table public.gv_inventory enable row level security;

-- One item per kind. The second key means only an owned item can be worn.
create table if not exists public.gv_equipped (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  item_id text not null references public.gv_items (id),
  primary key (user_id, kind),
  foreign key (user_id, item_id) references public.gv_inventory (user_id, item_id) on delete cascade
);

alter table public.gv_equipped enable row level security;


-- The daily cap, in one place for the grant and for what the page shows.
create or replace function public.gv_coins_per_day()
returns integer
language sql
immutable
set search_path to 'public'
as $function$
  select 120;
$function$;

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


-- What the shop shows for one account: coins, today's progress, every item
-- owned and what is worn. Only ever called by the functions below with the
-- caller's own id, so it is not granted to anyone.
create or replace function public.gv_wallet_json(p_user uuid)
returns json
language sql
stable
set search_path to 'public'
as $function$
  select json_build_object(
    'coins', coalesce(w.coins, 0),
    'earned_today', case when w.day = (now() at time zone 'utc')::date then w.earned_today else 0 end,
    'daily_cap', public.gv_coins_per_day(),
    'inventory', coalesce((
      select json_agg(json_build_object(
               'id', i.id, 'kind', i.kind, 'name', i.name,
               'rarity', i.rarity, 'value', i.value, 'qty', v.qty
             ) order by i.kind, i.name)
      from gv_inventory v
      join gv_items i on i.id = v.item_id
      where v.user_id = p_user
    ), '[]'::json),
    'equipped', coalesce((
      select json_object_agg(e.kind, e.item_id)
      from gv_equipped e
      where e.user_id = p_user
    ), '{}'::json)
  )
  from (select 1) one
  left join gv_wallet w on w.user_id = p_user;
$function$;

revoke all on function public.gv_wallet_json(uuid) from public, anon, authenticated;


-- Turns play into coins: one per full minute of each finished session that
-- ended since the last grant, up to the daily cap. A session over three hours
-- is left out whole (a tab left open, or a made-up row), and play past the cap
-- is not saved for tomorrow. Sessions ending in the future are skipped until
-- they are not, so a fast clock cannot move granted_through past them.
--
-- A new account's first grant counts all its earlier play, still capped.
create or replace function public.gv_grant_coins()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_cap integer := public.gv_coins_per_day();
  v_wallet gv_wallet;
  v_minutes integer;
  v_through timestamptz;
  v_earned integer;
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;

  insert into gv_wallet (user_id) values (v_user) on conflict (user_id) do nothing;
  -- Locked so two tabs granting at once cannot both pay the same minutes.
  select * into v_wallet from gv_wallet where user_id = v_user for update;
  if v_wallet.day is distinct from v_today then
    v_wallet.earned_today := 0;
  end if;

  select coalesce(sum(floor(extract(epoch from s.ended_at - s.started_at) / 60))
                    filter (where s.ended_at - s.started_at <= interval '3 hours'), 0),
         max(s.ended_at)
    into v_minutes, v_through
  from play_sessions s
  where s.user_id = v_user
    and s.ended_at is not null
    and s.ended_at <= now()
    and s.ended_at >= s.started_at
    and s.ended_at > coalesce(v_wallet.granted_through, '-infinity'::timestamptz);

  v_earned := least(v_minutes, greatest(v_cap - v_wallet.earned_today, 0));

  update gv_wallet
     set coins = coins + v_earned,
         earned_today = v_wallet.earned_today + v_earned,
         day = v_today,
         granted_through = greatest(granted_through, v_through)
   where user_id = v_user
  returning * into v_wallet;

  return json_build_object(
    'coins', v_wallet.coins,
    'earned', v_earned,
    'capped', v_wallet.earned_today >= v_cap,
    'earned_today', v_wallet.earned_today,
    'daily_cap', v_cap
  );
end;
$function$;

revoke all on function public.gv_grant_coins() from public, anon;
grant execute on function public.gv_grant_coins() to authenticated;


create or replace function public.gv_wallet_get()
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;

  return public.gv_wallet_json(v_user);
end;
$function$;

revoke all on function public.gv_wallet_get() from public, anon;
grant execute on function public.gv_wallet_get() to authenticated;


-- The crates with their exact chances, and every item there is, so anyone
-- (signed in or not) can see what they would be spending on before they do.
create or replace function public.gv_crates()
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

  return json_build_object(
    'tiers', coalesce((
      select json_agg(json_build_object(
               'id', t.id, 'name', t.name, 'price', t.price,
               'odds', json_build_object(
                 'common', t.common, 'uncommon', t.uncommon, 'rare', t.rare,
                 'epic', t.epic, 'legendary', t.legendary)
             ) order by t.sort)
      from gv_crate_tiers t
    ), '[]'::json),
    'items', coalesce((
      select json_agg(json_build_object(
               'id', i.id, 'kind', i.kind, 'name', i.name,
               'rarity', i.rarity, 'value', i.value
             ) order by i.kind, array_position(array['common', 'uncommon', 'rare', 'epic', 'legendary'], i.rarity), i.name)
      from gv_items i
    ), '[]'::json)
  );
end;
$function$;

grant execute on function public.gv_crates() to anon, authenticated;


-- Pays for a crate and rolls its three items. The wallet row is locked
-- before the balance is checked, so two quick clicks cannot spend the same
-- coins twice. Each roll picks a rarity by the tier's published chances, then
-- any item of that rarity with equal chance. A duplicate just adds to qty.
--
-- Returns the new balance and the three items, each marked new when it is
-- the first of its kind the account owns.
create or replace function public.gv_open_crate(p_tier text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_tier gv_crate_tiers;
  v_coins integer;
  v_roll numeric;
  v_rarity text;
  v_item gv_items;
  v_qty integer;
  v_items jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;

  select * into v_tier from gv_crate_tiers where id = p_tier;
  if not found then
    raise exception 'no such crate';
  end if;

  insert into gv_wallet (user_id) values (v_user) on conflict (user_id) do nothing;
  select coins into v_coins from gv_wallet where user_id = v_user for update;
  if v_coins < v_tier.price then
    raise exception 'not enough coins';
  end if;
  update gv_wallet set coins = coins - v_tier.price
   where user_id = v_user
  returning coins into v_coins;

  for n in 1..3 loop
    v_roll := random() * 100;
    v_rarity := case
      when v_roll < v_tier.common then 'common'
      when v_roll < v_tier.common + v_tier.uncommon then 'uncommon'
      when v_roll < v_tier.common + v_tier.uncommon + v_tier.rare then 'rare'
      when v_roll < v_tier.common + v_tier.uncommon + v_tier.rare + v_tier.epic then 'epic'
      else 'legendary'
    end;

    select * into v_item from gv_items where rarity = v_rarity order by random() limit 1;

    insert into gv_inventory (user_id, item_id, qty) values (v_user, v_item.id, 1)
    on conflict (user_id, item_id) do update set qty = gv_inventory.qty + 1
    returning qty into v_qty;

    v_items := v_items || jsonb_build_object(
      'id', v_item.id, 'kind', v_item.kind, 'name', v_item.name,
      'rarity', v_item.rarity, 'value', v_item.value, 'new', v_qty = 1);
  end loop;

  return json_build_object('coins', v_coins, 'items', v_items);
end;
$function$;

revoke all on function public.gv_open_crate(text) from public, anon;
grant execute on function public.gv_open_crate(text) to authenticated;


-- Wears an owned item in its kind's slot, replacing whatever was there.
-- Both return the whole wallet, so the page redraws from one shape.
create or replace function public.gv_equip(p_item_id text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_kind text;
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;

  select i.kind into v_kind
  from gv_inventory v
  join gv_items i on i.id = v.item_id
  where v.user_id = v_user and v.item_id = p_item_id;
  if not found then
    raise exception 'you do not own that item';
  end if;

  insert into gv_equipped (user_id, kind, item_id) values (v_user, v_kind, p_item_id)
  on conflict (user_id, kind) do update set item_id = excluded.item_id;

  return public.gv_wallet_json(v_user);
end;
$function$;

revoke all on function public.gv_equip(text) from public, anon;
grant execute on function public.gv_equip(text) to authenticated;

create or replace function public.gv_unequip(p_kind text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;

  delete from gv_equipped where user_id = v_user and kind = p_kind;
  return public.gv_wallet_json(v_user);
end;
$function$;

revoke all on function public.gv_unequip(text) from public, anon;
grant execute on function public.gv_unequip(text) to authenticated;

-- Giveaways.
--
-- Now and then the site owner gives a site thing, like a badge, a crate or a
-- name color, to one account picked at random. Signed-in players press Enter
-- on /giveaway/, once each, and the owner draws the winner from the analytics
-- dashboard. Only the username is ever used or shown. Prizes are never money,
-- gift cards or anything posted, and gv_giveaway_create turns away a prize
-- that reads like one.
--
-- Apply against project dxwjxzmlezfyursysays, after sql/rude.sql. Every
-- statement is safe to run twice. Applied on 30 September 2026.


create table if not exists public.gv_giveaways (
  id          serial primary key,
  title       text not null check (char_length(title) between 1 and 80),
  prize_text  text not null check (char_length(prize_text) between 1 and 200),
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  -- Filled in by the draw. Left empty, not cascaded, if the winner later
  -- deletes their account, so the giveaway still reads as drawn.
  winner_user uuid references auth.users (id) on delete set null,
  -- The username at the draw, so a later rename does not change who won.
  winner_name text,
  drawn_at    timestamptz
);

-- One entry per account per giveaway. Deleting the account takes its entries.
create table if not exists public.gv_giveaway_entries (
  giveaway_id integer not null references public.gv_giveaways (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (giveaway_id, user_id)
);

-- Everything goes through the functions below, so there is no policy to
-- write and a direct PostgREST request reads and writes nothing.
alter table public.gv_giveaways enable row level security;
alter table public.gv_giveaway_entries enable row level security;
revoke all on table public.gv_giveaways, public.gv_giveaway_entries from anon, authenticated;

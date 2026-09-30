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


-- One giveaway as pages see it. A winner whose account is gone, or whose
-- username is rude, is shown with no name: the page says "a GameVault
-- player" instead. The owner still sees the real name in gv_giveaway_list.
create or replace function public.gv_giveaway_json(p_row public.gv_giveaways, p_user uuid)
returns json
language sql
stable
set search_path to 'public'
as $function$
  select json_build_object(
    'id', p_row.id,
    'title', p_row.title,
    'prize_text', p_row.prize_text,
    'ends_at', p_row.ends_at,
    'status', case when p_row.drawn_at is not null then 'drawn'
                   when p_row.ends_at <= now() then 'closed'
                   else 'open' end,
    'entries', (select count(*) from gv_giveaway_entries e where e.giveaway_id = p_row.id),
    'entered', p_user is not null and exists (
      select 1 from gv_giveaway_entries e where e.giveaway_id = p_row.id and e.user_id = p_user),
    'winner_name', case when p_row.winner_user is null or public.gv_is_rude(p_row.winner_name) then null
                        else p_row.winner_name end,
    'drawn_at', p_row.drawn_at
  );
$function$;

revoke all on function public.gv_giveaway_json(public.gv_giveaways, uuid) from public, anon, authenticated;


-- What /giveaway/ and /winner/ need: the server's clock (so the countdown
-- never depends on the visitor's own), the giveaway to show, and the latest
-- one with a winner. The giveaway to show is the open one ending soonest, or
-- when none is open, the newest.
create or replace function public.gv_giveaway_current()
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_show gv_giveaways;
  v_last gv_giveaways;
begin
  if not public.gv_origin_allowed() then
    raise exception 'not read from this origin';
  end if;

  select * into v_show from gv_giveaways
  order by (drawn_at is null and ends_at > now()) desc,
           case when drawn_at is null and ends_at > now() then ends_at end,
           id desc
  limit 1;

  select * into v_last from gv_giveaways
  where drawn_at is not null
  order by drawn_at desc
  limit 1;

  return json_build_object(
    'now', now(),
    'signed_in', v_user is not null,
    'giveaway', case when v_show.id is null then null else gv_giveaway_json(v_show, v_user) end,
    'last_winner', case when v_last.id is null then null else gv_giveaway_json(v_last, v_user) end
  );
end;
$function$;

grant execute on function public.gv_giveaway_current() to anon, authenticated;

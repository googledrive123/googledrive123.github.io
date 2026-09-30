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


-- Enters the signed-in account. Any account can enter, whatever its name;
-- a rude name only keeps it off the page if it wins. Pressing Enter again is
-- not a second entry. Refusals are sentences the page shows as they are.
create or replace function public.gv_giveaway_enter(p_id integer)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_row gv_giveaways;
begin
  if v_user is null then
    raise exception 'Sign in to enter.';
  end if;
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;

  -- Shared lock: waits out a draw in progress, then sees it as drawn.
  select * into v_row from gv_giveaways where id = p_id for share;
  if not found then
    raise exception 'That giveaway is gone.';
  end if;
  if v_row.drawn_at is not null or v_row.ends_at <= now() then
    raise exception 'This giveaway has closed.';
  end if;

  insert into gv_giveaway_entries (giveaway_id, user_id)
  values (p_id, v_user)
  on conflict do nothing;

  return gv_giveaway_json(v_row, v_user);
end;
$function$;

revoke all on function public.gv_giveaway_enter(integer) from public, anon;
grant execute on function public.gv_giveaway_enter(integer) to authenticated;


-- Owner only, behind the dashboard secret.
--
-- The prize check is a backstop for the page's promise: site things only.
-- Anything that reads like money, game currency bought with money, or
-- something sent to a home is refused.
create or replace function public.gv_giveaway_create(
  p_secret text,
  p_title text,
  p_prize_text text,
  p_ends_at timestamptz
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_prize text := btrim(coalesce(p_prize_text, ''));
  v_row gv_giveaways;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;
  if char_length(v_title) not between 1 and 80 then
    raise exception 'title must be 1 to 80 characters';
  end if;
  if char_length(v_prize) not between 1 and 200 then
    raise exception 'prize must be 1 to 200 characters';
  end if;
  if v_prize ~* '[$£€]|\m(cash|money|dollars?|euros?|gift ?cards?|paypal|venmo|robux|v-?bucks|shipping|shipped|posted|mailed)\M' then
    raise exception 'prizes are site things only (badges, crates, a name color), never money or anything sent';
  end if;
  if p_ends_at is null or p_ends_at <= now() then
    raise exception 'the end time must be in the future';
  end if;

  insert into gv_giveaways (title, prize_text, ends_at)
  values (v_title, v_prize, p_ends_at)
  returning * into v_row;

  return row_to_json(v_row);
end;
$function$;

-- Every giveaway, newest first, with its entry count and the winner's real
-- name and account id, so the owner knows whom to give the prize to.
create or replace function public.gv_giveaway_list(p_secret text)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  return coalesce((
    select json_agg(json_build_object(
             'id', g.id,
             'title', g.title,
             'prize_text', g.prize_text,
             'ends_at', g.ends_at,
             'created_at', g.created_at,
             'entries', (select count(*) from gv_giveaway_entries e where e.giveaway_id = g.id),
             'winner_user', g.winner_user,
             'winner_name', g.winner_name,
             'drawn_at', g.drawn_at
           ) order by g.id desc)
    from (select * from gv_giveaways order by id desc limit 50) g
  ), '[]'::json);
end;
$function$;

-- Picks the winner. random() runs here, on the server, so no browser has a
-- say in who wins. Drawing before the end time closes entries there and then.
-- A giveaway is drawn once: a second draw is refused rather than quietly
-- picking someone else.
create or replace function public.gv_giveaway_draw(p_secret text, p_id integer)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row gv_giveaways;
  v_user uuid;
  v_name text;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  select * into v_row from gv_giveaways where id = p_id for update;
  if not found then
    raise exception 'no such giveaway';
  end if;
  if v_row.drawn_at is not null then
    raise exception 'already drawn';
  end if;

  select e.user_id, coalesce(nullif(btrim(p.username), ''), split_part(u.email, '@', 1))
  into v_user, v_name
  from gv_giveaway_entries e
  join auth.users u on u.id = e.user_id
  left join profiles p on p.id = e.user_id
  where e.giveaway_id = p_id
  order by random()
  limit 1;

  if v_user is null then
    raise exception 'no entries to draw from';
  end if;

  update gv_giveaways
     set winner_user = v_user,
         winner_name = v_name,
         drawn_at = now(),
         ends_at = least(ends_at, now())
   where id = p_id
  returning * into v_row;

  return json_build_object(
    'id', v_row.id,
    'winner_user', v_row.winner_user,
    'winner_name', v_row.winner_name,
    'drawn_at', v_row.drawn_at,
    'entries', (select count(*) from gv_giveaway_entries e where e.giveaway_id = p_id),
    -- The page will not show this name, so the dashboard can say why.
    'name_hidden', public.gv_is_rude(v_row.winner_name)
  );
end;
$function$;

-- For a giveaway made by mistake. Its entries go with it.
create or replace function public.gv_giveaway_delete(p_secret text, p_id integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  delete from gv_giveaways where id = p_id;
  return found;
end;
$function$;

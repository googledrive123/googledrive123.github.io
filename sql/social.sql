-- Friends and what they are playing.
--
-- Accounts add each other by username. A friend sees whether you are on the
-- site and which game you have open, as far as your status allows: online
-- shows both and lets friends ask to join your PolyTrack room, private shows
-- both but turns asks down, offline shows nothing.
--
-- Everything goes through the functions below. The tables have no policies,
-- so a direct PostgREST request reads and writes nothing.
--
-- Apply against project dxwjxzmlezfyursysays, after sql/avatars.sql and
-- sql/names.sql. Every statement is safe to run twice.


-- The name other players see for an account, by the same rule as
-- gv_public_profiles: the profile's username, else the name an account made
-- on the site signed up with, never a real email. A rude name never shows.
-- Only for the functions here, so nobody can call it directly.
create or replace function public.gv_display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when public.gv_is_rude(n.name) then 'player ' || left(p_user::text, 4) else n.name end
    from (
      select left(coalesce(
               nullif(btrim(p.username), ''),
               case when u.email like '%@gamevault.app' then split_part(u.email, '@', 1) end,
               'player'
             ), 30) as name
        from auth.users u
        left join profiles p on p.id = u.id
       where u.id = p_user
    ) n;
$function$;

revoke all on function public.gv_display_name(uuid) from public, anon, authenticated;


-- One row per account that has used chat or friends.
create table if not exists public.gv_social (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- online: friends see you and your game, and can ask to join.
  -- private: friends see you and your game, and cannot ask to join.
  -- offline: friends see you as offline.
  status  text not null default 'online' check (status in ('online', 'offline', 'private')),
  -- The game open on the site at the last poll, if any.
  game_id text check (char_length(game_id) <= 80),
  seen_at timestamptz
);

alter table public.gv_social enable row level security;
revoke all on table public.gv_social from anon, authenticated;


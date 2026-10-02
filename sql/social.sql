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


-- Whether new messages pop up over a game at all, and who is muted until
-- when, in epoch milliseconds, 0 being until turned back on. Keys are
-- server, user:<account id> and convo:<conversation id>.
alter table public.gv_social add column if not exists notify boolean not null default true;
alter table public.gv_social add column if not exists mutes jsonb not null default '{}'::jsonb
  check (pg_column_size(mutes) <= 8192);


-- A row says user_id wants friend_id as a friend. Rows both ways make them
-- friends; a row one way is a request still waiting.
create table if not exists public.gv_friend_links (
  user_id    uuid not null references auth.users (id) on delete cascade,
  friend_id  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists gv_friend_links_friend on public.gv_friend_links (friend_id);

alter table public.gv_friend_links enable row level security;
revoke all on table public.gv_friend_links from anon, authenticated;


-- Up to 8 accounts whose username starts with what was typed, for adding a
-- friend or starting a chat. Three letters at least, so it is a search for
-- someone rather than a list of everyone.
create or replace function public.gv_user_search(p_q text)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_q text := lower(btrim(coalesce(p_q, '')));
begin
  if not public.gv_origin_allowed() then
    raise exception 'Friends only work on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to find people.';
  end if;
  if char_length(v_q) < 3 then
    return '[]'::json;
  end if;
  -- Wildcards typed into the box are only characters.
  v_q := replace(replace(replace(left(v_q, 30), '\', '\\'), '%', '\%'), '_', '\_');

  return coalesce((
    select json_agg(json_build_object(
             'id', f.id,
             'username', f.name,
             'preset', v.preset,
             'upload', v.approved_upload
           ) order by lower(f.name))
      from (
        select p.id, public.gv_display_name(p.id) as name
          from profiles p
         where lower(p.username) like v_q || '%'
           and p.id <> v_user
         order by lower(p.username)
         limit 8
      ) f
      left join gv_avatars v on v.user_id = f.id
     -- A rude name was swapped for a neutral one, which is not what was typed.
     where lower(f.name) like v_q || '%'
  ), '[]'::json);
end;
$function$;

revoke all on function public.gv_user_search(text) from public, anon;
grant execute on function public.gv_user_search(text) to authenticated;


-- Asks p_user to be friends, or accepts if they asked first. Returns
-- 'friends' or 'asked'.
create or replace function public.gv_friend_ask(p_user uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_back boolean;
begin
  if not public.gv_origin_allowed() then
    raise exception 'Friends only work on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to add friends.';
  end if;
  if p_user is null or p_user = v_user then
    raise exception 'Pick someone else.';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'That account is gone.';
  end if;

  -- Two clicks at once would both pass the caps.
  perform pg_advisory_xact_lock(hashtext('gv_friend_ask'), hashtext(v_user::text));

  v_back := exists (select 1 from gv_friend_links where user_id = p_user and friend_id = v_user);

  if not exists (select 1 from gv_friend_links where user_id = v_user and friend_id = p_user) then
    if (select count(*) from gv_friend_links where user_id = v_user) >= 300 then
      raise exception 'You have as many friends as an account can have.';
    end if;
    if not v_back then
      if (select count(*) from gv_friend_links l
           where l.user_id = v_user
             and not exists (select 1 from gv_friend_links r
                              where r.user_id = l.friend_id and r.friend_id = v_user)) >= 50 then
        raise exception 'You have a lot of requests waiting. Cancel some first.';
      end if;
      if (select count(*) from gv_friend_links
           where user_id = v_user and created_at > now() - interval '1 hour') >= 30 then
        raise exception 'That is a lot of friend requests. Try again later.';
      end if;
    end if;
    insert into gv_friend_links (user_id, friend_id) values (v_user, p_user)
    on conflict do nothing;
  end if;

  return case when v_back then 'friends' else 'asked' end;
end;
$function$;

revoke all on function public.gv_friend_ask(uuid) from public, anon;
grant execute on function public.gv_friend_ask(uuid) to authenticated;


create or replace function public.gv_friend_answer(p_user uuid, p_yes boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if not public.gv_origin_allowed() then
    raise exception 'Friends only work on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to add friends.';
  end if;
  if not exists (select 1 from gv_friend_links where user_id = p_user and friend_id = v_user) then
    raise exception 'That request is gone.';
  end if;

  if p_yes then
    insert into gv_friend_links (user_id, friend_id) values (v_user, p_user)
    on conflict do nothing;
  else
    delete from gv_friend_links where user_id = p_user and friend_id = v_user;
  end if;
  return true;
end;
$function$;

revoke all on function public.gv_friend_answer(uuid, boolean) from public, anon;
grant execute on function public.gv_friend_answer(uuid, boolean) to authenticated;


-- Removes the link both ways, so it unfriends, cancels a request sent, and
-- turns down one received.
create or replace function public.gv_friend_remove(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if not public.gv_origin_allowed() then
    raise exception 'Friends only work on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to change friends.';
  end if;

  delete from gv_friend_links
   where (user_id = v_user and friend_id = p_user)
      or (user_id = p_user and friend_id = v_user);
  return found;
end;
$function$;

revoke all on function public.gv_friend_remove(uuid) from public, anon;
grant execute on function public.gv_friend_remove(uuid) to authenticated;


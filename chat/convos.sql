-- Direct messages and group chats.
--
-- Beside the one room for everyone (chat/chat.sql), any account can message
-- any other, or start a group with people it picks. The same rules hold:
-- only accounts talk, rude words never get in, there is a slow mode, a ban
-- from chat is a ban from these too, and anyone in a chat can report a
-- message to the site owner.
--
-- Everything goes through the functions below. Every one of them checks
-- that the account is in the conversation it names.
--
-- Apply against project dxwjxzmlezfyursysays, after chat/chat.sql and
-- sql/social.sql. Every statement is safe to run twice.


create table if not exists public.gv_convos (
  id         bigserial primary key,
  kind       text not null check (kind in ('dm', 'group')),
  -- A group's name. A group without one goes by its members.
  name       text check (char_length(name) <= 40),
  -- For a DM, the two account ids in order, so two people only ever have
  -- one.
  dm_key     text unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.gv_convo_members (
  convo_id  bigint not null references public.gv_convos (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  -- The newest message this member has seen.
  last_read bigint not null default 0,
  joined_at timestamptz not null default now(),
  primary key (convo_id, user_id)
);

create index if not exists gv_convo_members_user on public.gv_convo_members (user_id);

create table if not exists public.gv_convo_messages (
  id         bigserial primary key,
  convo_id   bigint not null references public.gv_convos (id) on delete cascade,
  -- Null for a line from the site itself, like who made the group.
  user_id    uuid references auth.users (id) on delete cascade,
  -- The name as it was when the message was sent.
  username   text,
  body       text not null,
  created_at timestamptz not null default now(),
  deleted    boolean not null default false
);

create index if not exists gv_convo_messages_convo on public.gv_convo_messages (convo_id, id);
create index if not exists gv_convo_messages_user on public.gv_convo_messages (user_id, created_at desc);

alter table public.gv_convos enable row level security;
alter table public.gv_convo_members enable row level security;
alter table public.gv_convo_messages enable row level security;
revoke all on table public.gv_convos, public.gv_convo_members, public.gv_convo_messages
  from anon, authenticated;


-- The DM between the signed-in account and p_user, made the first time.
create or replace function public.gv_dm_open(p_user uuid)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_key text;
  v_id bigint;
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to chat.';
  end if;
  if p_user is null or p_user = v_user then
    raise exception 'Pick someone else.';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'That account is gone.';
  end if;

  v_key := least(v_user::text, p_user::text) || ':' || greatest(v_user::text, p_user::text);
  select id into v_id from gv_convos where dm_key = v_key;
  if found then
    return v_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('gv_convo_new'), hashtext(v_user::text));
  -- Plenty for talking to people, and a cap on messaging everyone.
  if (select count(*) from gv_convos
       where created_by = v_user and kind = 'dm'
         and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You have started a lot of new chats. Try again later.';
  end if;

  insert into gv_convos (kind, dm_key, created_by) values ('dm', v_key, v_user)
  on conflict (dm_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from gv_convos where dm_key = v_key;
    return v_id;
  end if;

  insert into gv_convo_members (convo_id, user_id) values (v_id, v_user), (v_id, p_user);
  return v_id;
end;
$function$;

revoke all on function public.gv_dm_open(uuid) from public, anon;
grant execute on function public.gv_dm_open(uuid) to authenticated;


-- A group with the signed-in account and up to 19 others. The site's first
-- line in it is who made it, so it shows up for everyone straight away.
create or replace function public.gv_group_create(p_name text, p_users uuid[])
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '[[:space:][:cntrl:]]+', ' ', 'g')), 40);
  v_users uuid[];
  v_id bigint;
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to chat.';
  end if;
  if v_name = '' then
    v_name := null;
  end if;
  if v_name is not null and public.gv_name_rude(v_name) then
    raise exception 'That group name has words we do not allow here.';
  end if;

  select coalesce(array_agg(distinct u.id), '{}') into v_users
    from auth.users u
   where u.id = any (coalesce(p_users, '{}'))
     and u.id <> v_user;
  if cardinality(v_users) < 1 then
    raise exception 'Add at least one person.';
  end if;
  if cardinality(v_users) > 19 then
    raise exception 'A group can have up to 20 people.';
  end if;

  perform pg_advisory_xact_lock(hashtext('gv_convo_new'), hashtext(v_user::text));
  if (select count(*) from gv_convos
       where created_by = v_user and kind = 'group'
         and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'You have made a lot of groups. Try again later.';
  end if;

  insert into gv_convos (kind, name, created_by) values ('group', v_name, v_user)
  returning id into v_id;
  insert into gv_convo_members (convo_id, user_id)
  select v_id, x from unnest(array_append(v_users, v_user)) x;
  insert into gv_convo_messages (convo_id, body)
  values (v_id, public.gv_display_name(v_user) || ' made the group');
  return v_id;
end;
$function$;

revoke all on function public.gv_group_create(text, uuid[]) from public, anon;
grant execute on function public.gv_group_create(text, uuid[]) to authenticated;


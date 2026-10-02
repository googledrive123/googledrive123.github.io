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
-- sql/social.sql. Every statement is safe to run twice. Applied on 1 October 2026.


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

-- Who the message names with @ (chat/mentions.sql), as [{id, name}].
alter table public.gv_convo_messages
  add column if not exists mentions jsonb not null default '[]'::jsonb;

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


create or replace function public.gv_group_add(p_convo bigint, p_users uuid[])
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_new uuid[];
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to chat.';
  end if;
  if not exists (select 1 from gv_convos c join gv_convo_members m on m.convo_id = c.id
                  where c.id = p_convo and c.kind = 'group' and m.user_id = v_user) then
    raise exception 'You are not in that group.';
  end if;

  perform 1 from gv_convos where id = p_convo for update;

  select coalesce(array_agg(distinct u.id), '{}') into v_new
    from auth.users u
   where u.id = any (coalesce(p_users, '{}'))
     and not exists (select 1 from gv_convo_members m where m.convo_id = p_convo and m.user_id = u.id);
  if cardinality(v_new) = 0 then
    return false;
  end if;
  if (select count(*) from gv_convo_members where convo_id = p_convo) + cardinality(v_new) > 20 then
    raise exception 'A group can have up to 20 people.';
  end if;

  insert into gv_convo_members (convo_id, user_id)
  select p_convo, x from unnest(v_new) x;
  insert into gv_convo_messages (convo_id, body)
  values (p_convo, public.gv_display_name(v_user) || ' added '
    || (select string_agg(public.gv_display_name(x), ', ') from unnest(v_new) x));
  return true;
end;
$function$;

revoke all on function public.gv_group_add(bigint, uuid[]) from public, anon;
grant execute on function public.gv_group_add(bigint, uuid[]) to authenticated;


-- The group goes when its last member leaves.
create or replace function public.gv_group_leave(p_convo bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to chat.';
  end if;

  delete from gv_convo_members m
   using gv_convos c
   where c.id = m.convo_id and c.kind = 'group'
     and m.convo_id = p_convo and m.user_id = v_user;
  if not found then
    return false;
  end if;

  if exists (select 1 from gv_convo_members where convo_id = p_convo) then
    insert into gv_convo_messages (convo_id, body)
    values (p_convo, public.gv_display_name(v_user) || ' left');
  else
    delete from gv_convos where id = p_convo;
  end if;
  return true;
end;
$function$;

revoke all on function public.gv_group_leave(bigint) from public, anon;
grant execute on function public.gv_group_leave(bigint) to authenticated;


-- Sends a message as the signed-in account, with the same checks and the
-- same wait=<seconds> and until=<time> hints as gv_chat_send.
-- p_mentions is who the page says was picked after an @; chat/mentions.sql
-- decides who the message really names, members of the chat only.
drop function if exists public.gv_convo_send(bigint, text);
create or replace function public.gv_convo_send(p_convo bigint, p_body text, p_mentions uuid[] default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[[:space:][:cntrl:]]+', ' ', 'g'));
  v_ban gv_chat_bans;
  v_last timestamptz;
  v_wait integer;
  v_mentions jsonb;
  v_row gv_convo_messages;
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to chat.';
  end if;
  if not exists (select 1 from gv_convo_members where convo_id = p_convo and user_id = v_user) then
    raise exception 'You are not in that chat.';
  end if;
  if (select count(*) from gv_convo_members where convo_id = p_convo) < 2 then
    raise exception 'Nobody else is in this chat any more.';
  end if;
  if v_body = '' then
    raise exception 'Write something first.';
  end if;
  if char_length(v_body) > 300 then
    raise exception 'Messages can be up to 300 characters.';
  end if;

  select * into v_ban
    from gv_chat_bans
   where user_id = v_user
     and (until is null or until > now());
  if found then
    if v_ban.until is null then
      raise exception 'You cannot send messages in chat.';
    end if;
    raise exception 'You cannot send messages in chat for now.'
      using hint = 'until=' || to_char(v_ban.until at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  perform pg_advisory_xact_lock(hashtext('gv_convo_send'), hashtext(v_user::text));

  select max(created_at) into v_last
    from gv_convo_messages
   where user_id = v_user;
  if v_last > now() - interval '1 second' then
    raise exception 'Slow down a little.'
      using hint = 'wait=1';
  end if;

  -- The 30th message back decides when the next one is allowed.
  select created_at into v_last
    from gv_convo_messages
   where user_id = v_user
     and created_at > now() - interval '1 minute'
   order by created_at desc
  offset 29 limit 1;
  if found then
    v_wait := greatest(1, ceil(extract(epoch from v_last + interval '1 minute' - now()))::int);
    raise exception 'That is a lot of messages. Take a short break before sending more.'
      using hint = 'wait=' || v_wait;
  end if;

  if public.gv_is_rude(v_body) then
    raise exception 'That message has words we do not allow here. Try saying it another way.';
  end if;

  v_mentions := public.gv_mention_list(v_body, p_mentions, p_convo);
  insert into gv_convo_messages (convo_id, user_id, username, body, mentions)
  values (p_convo, v_user, public.gv_display_name(v_user), v_body, v_mentions)
  returning * into v_row;
  update gv_convo_members set last_read = v_row.id
   where convo_id = p_convo and user_id = v_user;
  insert into gv_mentions (user_id, from_user, convo_message_id, convo_id)
  select (x ->> 'id')::uuid, v_user, v_row.id, p_convo from jsonb_array_elements(v_mentions) x;

  return json_build_object(
    'id', v_row.id,
    'convo_id', v_row.convo_id,
    'user_id', v_row.user_id,
    'username', v_row.username,
    'body', v_row.body,
    'mentions', v_row.mentions,
    -- The blue check from analytics/verified.sql, shown next to the name.
    'verified', exists (select 1 from gv_verified v where v.key = v_user::text),
    'created_at', v_row.created_at,
    'mine', true
  );
end;
$function$;

revoke all on function public.gv_convo_send(bigint, text, uuid[]) from public, anon;
grant execute on function public.gv_convo_send(bigint, text, uuid[]) to authenticated;


-- The newest 100 messages still up, oldest first, or only those after the
-- last one a page already has.
create or replace function public.gv_convo_recent(p_convo bigint, p_after_id bigint default 0)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to chat.';
  end if;
  if not exists (select 1 from gv_convo_members where convo_id = p_convo and user_id = v_user) then
    raise exception 'You are not in that chat.';
  end if;

  return coalesce((
    select json_agg(json_build_object(
             'id', m.id,
             'convo_id', m.convo_id,
             'user_id', m.user_id,
             'username', m.username,
             'body', m.body,
             'mentions', m.mentions,
             'verified', exists (select 1 from gv_verified v where v.key = m.user_id::text),
             'created_at', m.created_at,
             'mine', m.user_id = v_user
           ) order by m.id)
      from (
        select *
          from gv_convo_messages
         where convo_id = p_convo
           and not deleted
           and id > coalesce(p_after_id, 0)
         order by id desc
         limit 100
      ) m
  ), '[]'::json);
end;
$function$;

revoke all on function public.gv_convo_recent(bigint, bigint) from public, anon;
grant execute on function public.gv_convo_recent(bigint, bigint) to authenticated;


create or replace function public.gv_convo_read(p_convo bigint, p_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to chat.';
  end if;

  update gv_convo_members
     set last_read = greatest(last_read, coalesce(p_id, 0))
   where convo_id = p_convo and user_id = v_user;
  return found;
end;
$function$;

revoke all on function public.gv_convo_read(bigint, bigint) from public, anon;
grant execute on function public.gv_convo_read(bigint, bigint) to authenticated;


-- Every chat the account is in, with the other members, the last message
-- and how many are unread.
create or replace function public.gv_convo_list()
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to chat.';
  end if;

  return coalesce((
    select json_agg(json_build_object(
             'id', c.id,
             'kind', c.kind,
             'name', c.name,
             'members', (
               select coalesce(json_agg(json_build_object(
                        'id', o.user_id,
                        'username', public.gv_display_name(o.user_id),
                        'verified', exists (select 1 from gv_verified v where v.key = o.user_id::text)
                      ) order by o.joined_at), '[]'::json)
                 from gv_convo_members o
                where o.convo_id = c.id and o.user_id <> v_user
             ),
             'last', (
               select json_build_object('id', l.id, 'username', l.username, 'body', l.body,
                                        'created_at', l.created_at, 'mine', l.user_id = v_user)
                 from gv_convo_messages l
                where l.convo_id = c.id and not l.deleted
                order by l.id desc limit 1
             ),
             'unread', (
               select count(*)
                 from gv_convo_messages u
                where u.convo_id = c.id and u.id > me.last_read
                  and not u.deleted and u.user_id is distinct from v_user
             )
           ) order by coalesce((select max(id) from gv_convo_messages x where x.convo_id = c.id), 0) desc, c.id desc)
      from gv_convo_members me
      join gv_convos c on c.id = me.convo_id
     where me.user_id = v_user
  ), '[]'::json);
end;
$function$;

revoke all on function public.gv_convo_list() from public, anon;
grant execute on function public.gv_convo_list() to authenticated;


create table if not exists public.gv_convo_reports (
  id         bigserial primary key,
  message_id bigint not null references public.gv_convo_messages (id) on delete cascade,
  reporter   uuid not null references auth.users (id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  resolved   boolean not null default false,
  unique (message_id, reporter)
);

alter table public.gv_convo_reports enable row level security;
revoke all on table public.gv_convo_reports from anon, authenticated;

-- Same as gv_chat_report, for a message in a chat the reporter is in.
create or replace function public.gv_convo_report(p_message_id bigint, p_reason text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_msg gv_convo_messages;
  v_id bigint;
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to report a message.';
  end if;

  select * into v_msg
    from gv_convo_messages
   where id = p_message_id and not deleted;
  if not found or not exists (select 1 from gv_convo_members
                               where convo_id = v_msg.convo_id and user_id = v_user) then
    raise exception 'That message is already gone.';
  end if;
  if v_msg.user_id is null or v_msg.user_id = v_user then
    raise exception 'You cannot report that message.';
  end if;

  if (select count(*) from gv_convo_reports
       where reporter = v_user and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'You have sent a lot of reports. Try again later.';
  end if;

  insert into gv_convo_reports (message_id, reporter, reason)
  values (p_message_id, v_user, left(nullif(btrim(coalesce(p_reason, '')), ''), 200))
  on conflict (message_id, reporter) do nothing
  returning id into v_id;

  return v_id is not null;
end;
$function$;

revoke all on function public.gv_convo_report(bigint, text) from public, anon;
grant execute on function public.gv_convo_report(bigint, text) to authenticated;


-- The dashboard's list of reported DM and group messages, behind the
-- dashboard secret, with the few messages before each one for context.
create or replace function public.gv_convo_mod_list(p_secret text)
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
    select json_agg(r order by r.last_reported_at desc)
      from (
        select m.id as message_id,
               max(rp.id) as report_id,
               m.convo_id,
               m.body,
               m.username,
               m.user_id,
               m.created_at,
               m.deleted,
               count(*) as count,
               max(rp.created_at) as last_reported_at,
               json_agg(json_build_object(
                 'reason', rp.reason,
                 'reporter', public.gv_display_name(rp.reporter),
                 'created_at', rp.created_at
               ) order by rp.id) as reports,
               (select json_agg(json_build_object('username', b.username, 'body', b.body) order by b.id)
                  from (select * from gv_convo_messages b
                         where b.convo_id = m.convo_id and b.id < m.id
                         order by b.id desc limit 5) b) as before
          from gv_convo_reports rp
          join gv_convo_messages m on m.id = rp.message_id
         where not rp.resolved
         group by m.id
      ) r
  ), '[]'::json);
end;
$function$;

revoke all on function public.gv_convo_mod_list(text) from public;
grant execute on function public.gv_convo_mod_list(text) to anon, authenticated;


create or replace function public.gv_convo_delete(p_secret text, p_message_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  update gv_convo_messages set deleted = true where id = p_message_id;
  if not found then
    return false;
  end if;
  update gv_convo_reports set resolved = true
   where message_id = p_message_id and not resolved;
  return true;
end;
$function$;

revoke all on function public.gv_convo_delete(text, bigint) from public;
grant execute on function public.gv_convo_delete(text, bigint) to anon, authenticated;


create or replace function public.gv_convo_resolve(p_secret text, p_report_id bigint)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  update gv_convo_reports set resolved = true
   where not resolved
     and message_id = (select message_id from gv_convo_reports where id = p_report_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.gv_convo_resolve(text, bigint) from public;
grant execute on function public.gv_convo_resolve(text, bigint) to anon, authenticated;


-- Called every few seconds by every signed-in page. Notes which game the
-- account has open, and hands back what is new since the cursors: server
-- chat after p_after_server and DM and group messages after p_after_convo.
--
-- A message can commit a moment after a later one, so the last ten seconds
-- come back every time as well, and the page drops ids it already has. A
-- null cursor returns no messages, only where the cursors stand now, so a
-- page that has just opened does not pop up the whole backlog.
create or replace function public.gv_social_poll(
  p_game text default null,
  p_after_server bigint default null,
  p_after_convo bigint default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_game text := nullif(left(btrim(coalesce(p_game, '')), 80), '');
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to chat.';
  end if;

  -- Written only when it would change what friends see, not on every poll.
  insert into gv_social (user_id, game_id, seen_at) values (v_user, v_game, now())
  on conflict (user_id) do update
    set game_id = excluded.game_id,
        seen_at = excluded.seen_at
  where gv_social.seen_at is null
     or gv_social.seen_at < now() - interval '45 seconds'
     or gv_social.game_id is distinct from excluded.game_id;

  return json_build_object(
    'server_last', (select coalesce(max(id), 0) from gv_chat_messages),
    'server', case when p_after_server is null then '[]'::json else coalesce((
      select json_agg(json_build_object(
               'id', m.id,
               'user_id', m.user_id,
               'username', m.username,
               'body', m.body,
               'mentions', m.mentions,
               'verified', exists (select 1 from gv_verified v where v.key = m.user_id::text),
               'created_at', m.created_at,
               'mine', m.user_id = v_user
             ) order by m.id)
        from (select * from gv_chat_messages
               where not deleted
                 and (id > p_after_server or created_at > now() - interval '10 seconds')
               order by id desc limit 20) m
    ), '[]'::json) end,
    'convo_last', (
      select coalesce(max(m.id), 0)
        from gv_convo_members me
        join gv_convo_messages m on m.convo_id = me.convo_id
       where me.user_id = v_user
    ),
    'convo', case when p_after_convo is null then '[]'::json else coalesce((
      select json_agg(json_build_object(
               'id', m.id,
               'convo_id', m.convo_id,
               'kind', c.kind,
               'name', c.name,
               'user_id', m.user_id,
               'username', m.username,
               'body', m.body,
               'mentions', m.mentions,
               'verified', exists (select 1 from gv_verified v where v.key = m.user_id::text),
               'created_at', m.created_at,
               'mine', m.user_id = v_user
             ) order by m.id)
        from (select m.*
                from gv_convo_members me
                join gv_convo_messages m on m.convo_id = me.convo_id
               where me.user_id = v_user
                 and not m.deleted
                 and (m.id > p_after_convo or m.created_at > now() - interval '10 seconds')
               order by m.id desc limit 20) m
        join gv_convos c on c.id = m.convo_id
    ), '[]'::json) end,
    'unread', (
      select count(*)
        from gv_convo_members me
        join gv_convo_messages m on m.convo_id = me.convo_id
       where me.user_id = v_user
         and m.id > me.last_read
         and not m.deleted
         and m.user_id is distinct from v_user
    ),
    'requests', (
      select count(*)
        from gv_friend_links l
       where l.friend_id = v_user
         and not exists (select 1 from gv_friend_links r
                          where r.user_id = v_user and r.friend_id = l.user_id)
    ),
    -- @mentions not looked at yet, by chat: 'server' or 'convo:<id>'.
    'mentioned', public.gv_mentions_unseen(v_user)
  );
end;
$function$;

revoke all on function public.gv_social_poll(text, bigint, bigint) from public, anon;
grant execute on function public.gv_social_poll(text, bigint, bigint) to authenticated;

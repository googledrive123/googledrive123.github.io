-- Site chat.
--
-- One room for everyone signed in, read and written through /chat/. Kept
-- safe for school: only accounts can talk, rude words never get in (see
-- sql/rude.sql), a slow mode stops floods, and anyone can report a message
-- to the site owner, who deletes messages and mutes accounts from the
-- analytics dashboard.
--
-- Apply against project dxwjxzmlezfyursysays, after sql/rude.sql. Every
-- statement is safe to run twice. Applied on 30 September 2026.


create table if not exists public.gv_chat_messages (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- The name as it was when the message was sent, so a later rename does not
  -- rewrite what people already read.
  username   text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  -- Removed by the owner. Kept rather than dropped so the dashboard still
  -- shows what was said.
  deleted    boolean not null default false
);

-- Slow mode looks up one account's latest messages on every send.
create index if not exists gv_chat_messages_user_created
  on public.gv_chat_messages (user_id, created_at desc);

-- A ban with no end date is for good.
create table if not exists public.gv_chat_bans (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  reason     text,
  until      timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.gv_chat_reports (
  id         bigserial primary key,
  message_id bigint not null references public.gv_chat_messages (id) on delete cascade,
  reporter   uuid not null references auth.users (id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  resolved   boolean not null default false,
  -- One report per person per message, so a crowd of reports means a crowd.
  unique (message_id, reporter)
);

-- Everything goes through the functions below, so there is no policy to
-- write and a direct PostgREST request reads and writes nothing.
alter table public.gv_chat_messages enable row level security;
alter table public.gv_chat_bans enable row level security;
alter table public.gv_chat_reports enable row level security;
revoke all on table public.gv_chat_messages, public.gv_chat_bans, public.gv_chat_reports
  from anon, authenticated;


-- Sends a message as the signed-in account. Every refusal is a sentence the
-- page shows as it is. A wait also comes back in the hint as wait=<seconds>
-- and a ban's end as until=<time>, for the page to count down or show in
-- the reader's own time.
create or replace function public.gv_chat_send(p_body text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  -- Line breaks and other control characters would let one message fill
  -- the screen.
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[[:space:][:cntrl:]]+', ' ', 'g'));
  v_ban gv_chat_bans;
  v_last timestamptz;
  v_wait integer;
  v_name text;
  v_row gv_chat_messages;
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to chat.';
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

  -- Two sends from the same account at once would both pass slow mode.
  perform pg_advisory_xact_lock(hashtext('gv_chat_send'), hashtext(v_user::text));

  select max(created_at) into v_last
    from gv_chat_messages
   where user_id = v_user;
  if v_last > now() - interval '5 seconds' then
    v_wait := greatest(1, ceil(extract(epoch from v_last + interval '5 seconds' - now()))::int);
    raise exception 'Slow mode is on. Wait a few seconds before sending again.'
      using hint = 'wait=' || v_wait;
  end if;

  -- The 20th message back decides when the next one is allowed.
  select created_at into v_last
    from gv_chat_messages
   where user_id = v_user
     and created_at > now() - interval '10 minutes'
   order by created_at desc
  offset 19 limit 1;
  if found then
    v_wait := greatest(1, ceil(extract(epoch from v_last + interval '10 minutes' - now()))::int);
    raise exception 'That is a lot of messages. Take a short break before sending more.'
      using hint = 'wait=' || v_wait;
  end if;

  if public.gv_is_rude(v_body) then
    raise exception 'That message has words we do not allow here. Try saying it another way.';
  end if;

  -- The profile name, or the name the account signed up with. A rude one is
  -- not put in front of everyone; the owner still sees the account.
  select nullif(btrim(p.username), '') into v_name from profiles p where p.id = v_user;
  if v_name is null then
    select split_part(u.email, '@', 1) into v_name from auth.users u where u.id = v_user;
  end if;
  v_name := left(coalesce(nullif(v_name, ''), 'player'), 30);
  if public.gv_is_rude(v_name) then
    v_name := 'player ' || left(v_user::text, 4);
  end if;

  insert into gv_chat_messages (user_id, username, body)
  values (v_user, v_name, v_body)
  returning * into v_row;

  return json_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'body', v_row.body,
    'created_at', v_row.created_at,
    'mine', true
  );
end;
$function$;

revoke all on function public.gv_chat_send(text) from public, anon;
grant execute on function public.gv_chat_send(text) to authenticated;


-- The newest 100 messages still up, oldest first, or only those after the
-- last one a page already has.
create or replace function public.gv_chat_recent(p_after_id bigint default 0)
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
             'id', m.id,
             'username', m.username,
             'body', m.body,
             'created_at', m.created_at,
             'mine', m.user_id = v_user
           ) order by m.id)
      from (
        select *
          from gv_chat_messages
         where not deleted
           and id > coalesce(p_after_id, 0)
         order by id desc
         limit 100
      ) m
  ), '[]'::json);
end;
$function$;

revoke all on function public.gv_chat_recent(bigint) from public, anon;
grant execute on function public.gv_chat_recent(bigint) to authenticated;


-- Flags a message for the owner. Reporting the same message again changes
-- nothing and says so: false instead of true.
create or replace function public.gv_chat_report(p_message_id bigint, p_reason text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_author uuid;
  v_id bigint;
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to report a message.';
  end if;

  select user_id into v_author
    from gv_chat_messages
   where id = p_message_id and not deleted;
  if not found then
    raise exception 'That message is already gone.';
  end if;
  if v_author = v_user then
    raise exception 'You cannot report your own message.';
  end if;

  -- Enough for anyone reporting in good faith, and a cap on burying the
  -- owner's list.
  if (select count(*) from gv_chat_reports
       where reporter = v_user and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'You have sent a lot of reports. Try again later.';
  end if;

  insert into gv_chat_reports (message_id, reporter, reason)
  values (p_message_id, v_user, left(nullif(btrim(coalesce(p_reason, '')), ''), 200))
  on conflict (message_id, reporter) do nothing
  returning id into v_id;

  return v_id is not null;
end;
$function$;

revoke all on function public.gv_chat_report(bigint, text) from public, anon;
grant execute on function public.gv_chat_report(bigint, text) to authenticated;


-- Everything the dashboard's chat panel shows, behind the dashboard secret.
--
-- reports: one entry per message with open reports, newest report first,
-- with every reason and who gave it. report_id is the newest report's id,
-- the one to hand gv_chat_resolve.
-- recent: the last 200 messages, removed ones included.
-- bans: every ban, with whether it still holds.
create or replace function public.gv_chat_mod_list(p_secret text)
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

  return json_build_object(
    'reports', coalesce((
      select json_agg(r order by r.last_reported_at desc)
        from (
          select m.id as message_id,
                 max(rp.id) as report_id,
                 m.body,
                 m.username,
                 m.user_id,
                 m.created_at,
                 m.deleted,
                 count(*) as count,
                 max(rp.created_at) as last_reported_at,
                 json_agg(json_build_object(
                   'id', rp.id,
                   'reason', rp.reason,
                   'reporter', coalesce(nullif(btrim(p.username), ''), rp.reporter::text),
                   'reporter_id', rp.reporter,
                   'created_at', rp.created_at
                 ) order by rp.id) as reports
            from gv_chat_reports rp
            join gv_chat_messages m on m.id = rp.message_id
            left join profiles p on p.id = rp.reporter
           where not rp.resolved
           group by m.id
        ) r
    ), '[]'::json),
    'recent', coalesce((
      select json_agg(json_build_object(
               'id', m.id,
               'user_id', m.user_id,
               'username', m.username,
               'body', m.body,
               'created_at', m.created_at,
               'deleted', m.deleted,
               'banned', exists (
                 select 1 from gv_chat_bans b
                  where b.user_id = m.user_id and (b.until is null or b.until > now())
               )
             ) order by m.id desc)
        from (select * from gv_chat_messages order by id desc limit 200) m
    ), '[]'::json),
    'bans', coalesce((
      select json_agg(json_build_object(
               'user_id', b.user_id,
               'username', coalesce(
                 nullif(btrim(p.username), ''),
                 (select m.username from gv_chat_messages m
                   where m.user_id = b.user_id order by m.id desc limit 1),
                 b.user_id::text),
               'reason', b.reason,
               'until', b.until,
               'created_at', b.created_at,
               'active', b.until is null or b.until > now()
             ) order by b.created_at desc)
        from gv_chat_bans b
        left join profiles p on p.id = b.user_id
    ), '[]'::json)
  );
end;
$function$;


-- Takes a message down for everyone. Its open reports are done with too.
create or replace function public.gv_chat_delete(p_secret text, p_message_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  update gv_chat_messages set deleted = true where id = p_message_id;
  if not found then
    return false;
  end if;
  update gv_chat_reports set resolved = true
   where message_id = p_message_id and not resolved;
  return true;
end;
$function$;


-- Mutes an account for p_days days, or for good with no p_days. Banning
-- again replaces the old ban.
create or replace function public.gv_chat_ban(
  p_secret text,
  p_user_id uuid,
  p_reason text,
  p_days integer default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row gv_chat_bans;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'no such account';
  end if;
  if p_days is not null and p_days < 1 then
    raise exception 'days must be at least 1';
  end if;

  insert into gv_chat_bans (user_id, reason, until, created_at)
  values (
    p_user_id,
    left(nullif(btrim(coalesce(p_reason, '')), ''), 200),
    case when p_days is null then null else now() + make_interval(days => p_days) end,
    now()
  )
  on conflict (user_id) do update
    set reason = excluded.reason,
        until = excluded.until,
        created_at = excluded.created_at
  returning * into v_row;

  return row_to_json(v_row);
end;
$function$;

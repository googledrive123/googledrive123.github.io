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
-- page shows as it is.
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

  if public.gv_is_rude(v_body) then
    raise exception 'That message has words we do not allow here. Try saying it another way.';
  end if;

  -- The profile name, or the name the account signed up with.
  select nullif(btrim(p.username), '') into v_name from profiles p where p.id = v_user;
  if v_name is null then
    select split_part(u.email, '@', 1) into v_name from auth.users u where u.id = v_user;
  end if;
  v_name := left(coalesce(nullif(v_name, ''), 'player'), 30);

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

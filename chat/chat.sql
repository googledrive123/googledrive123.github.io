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

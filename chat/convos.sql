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


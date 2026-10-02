-- @mentions in chat.
--
-- Typing @ in the server room, a direct message or a group chat brings up
-- the names that match, and picking one names that account in the message.
-- The message keeps who it named, so the name stands out for everyone, and
-- each account named is told: an @ on the chat button and on that chat
-- until they open it, and a pop-up while they are on the site.
--
-- Who a message names is settled here, not by the page. An account the page
-- says was picked counts only while "@" and its name are still in the text,
-- and "@name" typed out counts when it is someone's username exactly. In a
-- direct message or group chat only its members can be named. Nobody is
-- told about naming themselves, and a message names ten people at most.
--
-- gv_chat_send (chat/chat.sql), gv_convo_send and gv_social_poll
-- (chat/convos.sql) call these, so apply this file with those two. Against
-- project dxwjxzmlezfyursysays. Every statement is safe to run twice.


create table if not exists public.gv_mentions (
  id               bigserial primary key,
  -- Who was named, and who named them.
  user_id          uuid not null references auth.users (id) on delete cascade,
  from_user        uuid not null references auth.users (id) on delete cascade,
  -- The server room message, or the direct or group one and its chat.
  message_id       bigint references public.gv_chat_messages (id) on delete cascade,
  convo_message_id bigint references public.gv_convo_messages (id) on delete cascade,
  convo_id         bigint references public.gv_convos (id) on delete cascade,
  created_at       timestamptz not null default now(),
  seen             boolean not null default false
);

create index if not exists gv_mentions_unseen on public.gv_mentions (user_id) where not seen;

alter table public.gv_mentions enable row level security;
revoke all on table public.gv_mentions from anon, authenticated;


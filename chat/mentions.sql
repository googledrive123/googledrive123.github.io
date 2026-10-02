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


-- Who a message names, in the order they come in it, as [{id, name}]: the
-- name the way chat shows it, which is what follows the @.
create or replace function public.gv_mention_list(p_body text, p_ids uuid[], p_convo bigint default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.at), '[]'::jsonb)
    from (
      select x.id, x.name, strpos(lower(p_body), '@' || lower(x.name)) as at
        from (
          select p.id, public.gv_display_name(p.id) as name
            from profiles p
           where p.id = any(coalesce(p_ids, '{}'::uuid[]))
              or lower(p.username) in (
                   select lower(r.m[1])
                     from regexp_matches(p_body, '@([A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*)', 'g') as r(m))
        ) x
       where x.id is distinct from auth.uid()
         and strpos(lower(p_body), '@' || lower(x.name)) > 0
         and (p_convo is null
              or exists (select 1 from gv_convo_members cm where cm.convo_id = p_convo and cm.user_id = x.id))
       order by 3
       limit 10
    ) c;
$function$;

revoke all on function public.gv_mention_list(text, uuid[], bigint) from public, anon, authenticated;


-- The @mentions an account has not looked at yet, counted by chat: 'server'
-- or 'convo:<id>'. A message the owner took down, or a chat the account has
-- left, no longer counts.
create or replace function public.gv_mentions_unseen(p_user uuid)
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(json_object_agg(t.k, t.n), '{}'::json)
    from (
      select case when x.message_id is not null then 'server' else 'convo:' || x.convo_id end as k,
             count(*) as n
        from gv_mentions x
       where x.user_id = p_user
         and not x.seen
         and (exists (select 1 from gv_chat_messages m where m.id = x.message_id and not m.deleted)
              or (exists (select 1 from gv_convo_messages m where m.id = x.convo_message_id and not m.deleted)
                  and exists (select 1 from gv_convo_members cm where cm.convo_id = x.convo_id and cm.user_id = p_user)))
       group by 1
    ) t;
$function$;

revoke all on function public.gv_mentions_unseen(uuid) from public, anon, authenticated;


-- The signed-in account has looked at a chat, 'server' or 'convo:<id>', so
-- its @mentions there are seen.
create or replace function public.gv_mentions_seen(p_key text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_convo bigint;
begin
  if not public.gv_origin_allowed() then
    raise exception 'Chat only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to chat.';
  end if;
  if coalesce(p_key, '') ~ '^convo:[0-9]+$' then
    v_convo := split_part(p_key, ':', 2)::bigint;
  end if;

  update gv_mentions
     set seen = true
   where user_id = v_user
     and not seen
     and ((p_key = 'server' and message_id is not null)
          or (v_convo is not null and convo_id = v_convo));
  return found;
end;
$function$;

revoke all on function public.gv_mentions_seen(text) from public, anon;
grant execute on function public.gv_mentions_seen(text) to authenticated;

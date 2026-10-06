-- Things that may not be said in chat at all, whatever words are around them:
-- links of any kind, and anything else the owner names.

create table if not exists public.gv_chat_blocklist (
  id         bigserial primary key,
  pattern    text not null,
  form       text not null default 'text' check (form in ('text', 'words')),
  -- What the sender is told.
  says       text not null default 'That message has something we do not allow in chat.',
  -- Why it is there, for the owner.
  note       text,
  created_at timestamptz not null default now()
);

-- Read only by the function below, never directly.
alter table public.gv_chat_blocklist enable row level security;
revoke all on table public.gv_chat_blocklist from anon, authenticated;


-- What to tell the sender when the text holds something on the list, or
-- null when it does not.
create or replace function public.gv_chat_blocked(p_text text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  with t as (
    -- Invisible characters would otherwise cut a word or a number in two.
    select lower(regexp_replace(coalesce(p_text, ''), '[\u00ad\u200b-\u200f\u2060\ufeff]', '', 'g')) as raw
  )
  select b.says
  from gv_chat_blocklist b, t
  where case b.form
          when 'words' then regexp_replace(t.raw, '[^a-z]+', ' ', 'g')
          else t.raw
        end ~ b.pattern
  order by b.id
  limit 1;
$function$;

-- Only the send functions ask, as the database's owner.
revoke all on function public.gv_chat_blocked(text) from public, anon, authenticated;

-- Chat bans that follow the person.
--
-- A ban used to hold one account, so a new account carried on where it left
-- off. Now every browser a banned account has been signed in on counts as
-- banned too: any other account seen on one of them is banned along with it,
-- straight away for the ones known when the ban is given, and on its next
-- visit for any that turn up later. A banned account signing in on a new
-- browser bans that browser the same way.
--
-- A browser is the visitor id js/identity.js keeps (in a cookie, IndexedDB
-- and localStorage, so clearing one brings it back from the others). Two
-- places say which accounts have used which browser: the chat poll, which
-- now sends it, and the analytics events from before that.
--
-- It does not go by what a device looks like. Hundreds of school
-- Chromebooks look exactly the same, so that would ban whole classes. The
-- dashboard instead lists accounts made after a ban on a device that looks
-- like the banned one's, for the owner to decide on.
--
-- A ban that follows from another keeps that one's account in via, and
-- goes when it does: unbanning the first account unbans the rest.
--
-- Apply against project dxwjxzmlezfyursysays, with chat/chat.sql and
-- chat/convos.sql, which call these. Every statement is safe to run twice.


-- Which browsers each account has been signed in on, as the chat poll
-- reports them.
create table if not exists public.gv_account_browsers (
  user_id    uuid not null references auth.users (id) on delete cascade,
  visitor_id text not null,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (user_id, visitor_id)
);

create index if not exists gv_account_browsers_visitor on public.gv_account_browsers (visitor_id);
-- The analytics side of the same question, looked up by account.
create index if not exists analytics_visitor_users_user on public.analytics_visitor_users (user_id);

alter table public.gv_account_browsers enable row level security;
revoke all on table public.gv_account_browsers from anon, authenticated;


-- Every account and browser seen together, from the poll and from analytics.
create or replace view public.gv_browser_links as
  select user_id, visitor_id from public.gv_account_browsers
  union
  select user_id, visitor_id from public.analytics_visitor_users;

revoke all on public.gv_browser_links from anon, authenticated;


-- Bans an account that shares a browser with a banned one, unless it is
-- banned already. It takes the end date of the ban it follows.
create or replace function public.gv_ban_follow(p_user uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into gv_chat_bans (user_id, reason, until, created_at, via)
  select p_user, 'Same browser as a banned account', b.until, now(), coalesce(b.via, b.user_id)
    from gv_browser_links mine
    join gv_browser_links other on other.visitor_id = mine.visitor_id and other.user_id <> p_user
    join gv_chat_bans b on b.user_id = other.user_id and (b.until is null or b.until > now())
   where mine.user_id = p_user
     and exists (select 1 from auth.users u where u.id = p_user)
   order by b.until desc nulls first
   limit 1
  on conflict (user_id) do update
    set reason = excluded.reason,
        until = excluded.until,
        created_at = excluded.created_at,
        via = excluded.via
    where gv_chat_bans.until is not null and gv_chat_bans.until <= now();
$function$;

revoke all on function public.gv_ban_follow(uuid) from public, anon, authenticated;


-- What a browser looked like on its last page view: the system, the
-- browser, the screen, the time zone and language, and the hardware.
create or replace function public.gv_browser_traits(p_visitor text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select md5(concat_ws('|', e.os, e.browser, e.screen, e.tz, e.lang,
                       e.meta ->> 'cpu', e.meta ->> 'mem_gb', e.meta ->> 'dpr'))
    from analytics_events e
   where e.visitor_id = p_visitor and e.event = 'pageview'
   order by e.ts desc
   limit 1;
$function$;

revoke all on function public.gv_browser_traits(text) from public, anon, authenticated;


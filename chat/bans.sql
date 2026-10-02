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


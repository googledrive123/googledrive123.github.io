-- Testers.
--
-- Accounts the site owner trusts to try games before everyone else. A game
-- waiting to go live is marked "staging": true in games.json, and /test/
-- lists those for testers to play and mark as working, broken or having a
-- problem. The owner hands out the role and reads the reports from the
-- analytics dashboard.
--
-- Apply against project dxwjxzmlezfyursysays, after sql/rude.sql. Every
-- statement is safe to run twice. Applied on 30 September 2026.


create table if not exists public.gv_testers (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

-- Everything goes through the functions below, so there is no policy to
-- write and a direct PostgREST request reads and writes nothing.
alter table public.gv_testers enable row level security;
revoke all on table public.gv_testers from anon, authenticated;

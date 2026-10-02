-- Polls.
--
-- The site owner asks something from the analytics dashboard, with two to
-- six answers and an end date or none. Everyone who comes to the site gets
-- it in a pop-up until they answer it or put it off, and every poll stays on
-- /polls/ with its results.
--
-- One vote each. A signed-in player votes as their account, a guest as the
-- browser's visitor id (js/identity.js), and a vote counts for both: an
-- account cannot vote again from another browser, and a guest who signs in
-- afterwards cannot vote again either. Browsers an account has been signed
-- in on (gv_browser_links, chat/bans.sql) count as its own, so neither can a
-- guest on a browser an account that voted has used.
--
-- Results show once you have voted, and to everyone once a poll is over.
--
-- Apply against project dxwjxzmlezfyursysays, after chat/bans.sql. Every
-- statement is safe to run twice.


create table if not exists public.gv_polls (
  id         bigserial primary key,
  question   text not null check (char_length(question) between 1 and 200),
  -- The answers in order, as a list of text.
  options    jsonb not null,
  created_at timestamptz not null default now(),
  -- Null for a poll that runs until the owner closes it.
  ends_at    timestamptz,
  closed     boolean not null default false
);

create table if not exists public.gv_poll_votes (
  id         bigserial primary key,
  poll_id    bigint not null references public.gv_polls (id) on delete cascade,
  -- Which answer, counting from 0.
  choice     integer not null,
  user_id    uuid references auth.users (id) on delete set null,
  visitor_id text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists gv_poll_votes_visitor on public.gv_poll_votes (poll_id, visitor_id);

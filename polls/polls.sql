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
create unique index if not exists gv_poll_votes_user on public.gv_poll_votes (poll_id, user_id) where user_id is not null;

alter table public.gv_polls enable row level security;
alter table public.gv_poll_votes enable row level security;
revoke all on table public.gv_polls, public.gv_poll_votes from anon, authenticated;


-- The answer this account or browser gave, or null: its own vote, or one
-- from a browser the account has used, or from an account that has used
-- this browser.
create or replace function public.gv_poll_mine(p_poll bigint, p_user uuid, p_visitor text)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select v.choice
    from gv_poll_votes v
   where v.poll_id = p_poll
     and ((p_user is not null and v.user_id = p_user)
          or (p_visitor is not null and v.visitor_id = p_visitor)
          or (p_user is not null and v.visitor_id in (select l.visitor_id from gv_browser_links l where l.user_id = p_user))
          or (p_visitor is not null and v.user_id in (select l.user_id from gv_browser_links l where l.visitor_id = p_visitor)))
   limit 1;
$function$;

revoke all on function public.gv_poll_mine(bigint, uuid, text) from public, anon, authenticated;


-- One poll as the pages show it. counts, one per answer, only come with it
-- once the reader has voted or the poll is over.
create or replace function public.gv_poll_json(p_poll bigint, p_user uuid, p_visitor text)
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
  select json_build_object(
           'id', p.id,
           'question', p.question,
           'options', p.options,
           'created_at', p.created_at,
           'ends_at', p.ends_at,
           'open', x.open,
           'voted', x.mine,
           'total', (select count(*) from gv_poll_votes v where v.poll_id = p.id),
           'counts', case when x.mine is not null or not x.open then (
             select json_agg(coalesce(c.n, 0) order by i.idx)
               from generate_series(0, jsonb_array_length(p.options) - 1) as i(idx)
               left join (select choice, count(*) as n from gv_poll_votes
                           where poll_id = p.id group by choice) c on c.choice = i.idx
           ) end
         )
    from gv_polls p,
         lateral (select not p.closed and (p.ends_at is null or p.ends_at > now()) as open,
                         public.gv_poll_mine(p.id, p_user, p_visitor) as mine) x
   where p.id = p_poll;
$function$;

revoke all on function public.gv_poll_json(bigint, uuid, text) from public, anon, authenticated;


-- Every poll still open, newest first, for the pop-up.
create or replace function public.gv_polls_open(p_visitor text default null)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_visitor text := nullif(left(btrim(coalesce(p_visitor, '')), 64), '');
begin
  if not public.gv_origin_allowed() then
    raise exception 'Polls only work on GameVault.';
  end if;

  return coalesce((
    select json_agg(public.gv_poll_json(p.id, auth.uid(), v_visitor) order by p.id desc)
      from gv_polls p
     where not p.closed and (p.ends_at is null or p.ends_at > now())
  ), '[]'::json);
end;
$function$;

grant execute on function public.gv_polls_open(text) to anon, authenticated;


-- The newest 50 polls, open or not, for /polls/.
create or replace function public.gv_polls_list(p_visitor text default null)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_visitor text := nullif(left(btrim(coalesce(p_visitor, '')), 64), '');
begin
  if not public.gv_origin_allowed() then
    raise exception 'Polls only work on GameVault.';
  end if;

  return coalesce((
    select json_agg(public.gv_poll_json(p.id, auth.uid(), v_visitor) order by p.id desc)
      from (select id from gv_polls order by id desc limit 50) p
  ), '[]'::json);
end;
$function$;

grant execute on function public.gv_polls_list(text) to anon, authenticated;


-- Votes, as the signed-in account if there is one and as this browser
-- either way. Voting twice changes nothing and hands back the first vote.
create or replace function public.gv_poll_vote(p_poll bigint, p_option integer, p_visitor text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_visitor text := nullif(left(btrim(coalesce(p_visitor, '')), 64), '');
  v_poll gv_polls;
begin
  if not public.gv_origin_allowed() then
    raise exception 'Polls only work on GameVault.';
  end if;
  if v_visitor is null then
    raise exception 'Could not vote from this browser. Refresh and try again.';
  end if;

  select * into v_poll from gv_polls where id = p_poll;
  if not found then
    raise exception 'That poll is gone.';
  end if;

  if public.gv_poll_mine(p_poll, v_user, v_visitor) is null then
    insert into gv_poll_votes (poll_id, choice, user_id, visitor_id)
    values (p_poll, p_option, v_user, v_visitor)
    on conflict do nothing;
  end if;

  return public.gv_poll_json(p_poll, v_user, v_visitor);
end;
$function$;

grant execute on function public.gv_poll_vote(bigint, integer, text) to anon, authenticated;

-- Monthly PolyTrack challenge.
--
-- Each month the site owner picks one PolyTrack track. Every run driven on it
-- during that month counts, straight from the site's PolyTrack leaderboard
-- (games/polytrack/leaderboard.sql), and once the month is over the owner
-- closes it from the analytics dashboard: first place gets the
-- challenge-winner badge, second and third get challenge-top3. The badge is
-- the whole prize. /challenge/ shows the month, /winner/ shows its winner.
--
-- Months run on UTC, so everyone has the same finish line.
--
-- Apply against project dxwjxzmlezfyursysays, after
-- games/polytrack/leaderboard.sql and sql/names.sql. Every statement is safe
-- to run twice. Applied on 30 September 2026.


-- One row per month, keyed by its first day.
create table if not exists public.gv_challenges (
  month     date primary key check (extract(day from month) = 1),
  track_id  text not null check (char_length(track_id) between 1 and 120),
  title     text not null check (char_length(title) between 1 and 80),
  note      text check (char_length(note) <= 300),
  -- When the badges were handed out. Empty until gv_challenge_close.
  closed_at timestamptz
);

-- Each player's best run on the month's track, during that month. The board
-- keeps a player's best ever, which can be older than the month; this keeps
-- the month's best alone. player_key is the board's own key: an account's
-- user id, or 'guest:' and the browser's visitor id.
create table if not exists public.gv_challenge_runs (
  month      date not null references public.gv_challenges (month) on delete cascade,
  track_id   text not null,
  player_key text not null,
  nickname   text not null,
  -- Deleting an account takes its runs with it, as it does its board times.
  user_id    uuid references auth.users (id) on delete cascade,
  frames     integer not null check (frames > 0),
  at         timestamptz not null default now(),
  primary key (month, player_key)
);

create index if not exists gv_challenge_runs_order
  on public.gv_challenge_runs (month, frames, at);

-- Badges, keyed the same way as the board so it can show them beside a time.
-- month is the challenge that earned the badge.
create table if not exists public.gv_badges (
  player_key text not null,
  badge      text not null check (badge ~ '^[a-z0-9-]{1,40}$'),
  month      date not null,
  -- So deleting an account takes its badges too. Empty for a guest.
  user_id    uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_key, badge, month)
);

-- Everything goes through the functions below, so there is no policy to
-- write and a direct PostgREST request reads and writes nothing.
alter table public.gv_challenges enable row level security;
alter table public.gv_challenge_runs enable row level security;
alter table public.gv_badges enable row level security;
revoke all on table public.gv_challenges, public.gv_challenge_runs, public.gv_badges from anon, authenticated;


-- This month, by UTC.
create or replace function public.gv_challenge_month()
returns date
language sql
stable
set search_path to 'public'
as $function$
  select date_trunc('month', now() at time zone 'utc')::date;
$function$;

revoke all on function public.gv_challenge_month() from public, anon, authenticated;

-- A time the way the game writes it. Frames are milliseconds.
create or replace function public.gv_challenge_time(p_frames integer)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select lpad((p_frames / 60000)::text, 2, '0') || ':'
      || lpad((p_frames / 1000 % 60)::text, 2, '0') || '.'
      || lpad((p_frames % 1000)::text, 3, '0');
$function$;

revoke all on function public.gv_challenge_time(integer) from public, anon, authenticated;

-- A month's runs in finishing order. A tie goes to whoever drove it first.
create or replace function public.gv_challenge_ranked(p_month date)
returns table (
  rank bigint, player_key text, nickname text, user_id uuid, frames integer, at timestamptz
)
language sql
stable
set search_path to 'public'
as $function$
  select row_number() over (order by r.frames, r.at, r.player_key),
         r.player_key, r.nickname, r.user_id, r.frames, r.at
  from gv_challenge_runs r
  where r.month = p_month;
$function$;

revoke all on function public.gv_challenge_ranked(date) from public, anon, authenticated;


-- Every run sent to the board passes through here on its way in.
--
-- It has to be BEFORE INSERT. polytrack_submit upserts, so by the time the
-- row is written, and so in any AFTER trigger, frames holds the player's best
-- ever, which can be a time from an earlier month. Only the proposed row
-- carries the time just driven, and BEFORE INSERT fires for every proposed
-- row, including the ones the upsert then turns into an update.
--
-- Triggers run in name order, so this one runs before gv_scores_name_guard
-- and does the same name check itself.
create or replace function public.gv_challenge_capture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key   text;
  v_month date;
begin
  v_key := coalesce(new.user_id::text, 'guest:' || new.visitor_id);
  v_month := gv_challenge_month();
  if v_key is null or coalesce(new.frames, 0) <= 0
     or not exists (select 1 from gv_challenges c
                    where c.month = v_month and c.track_id = new.track_id) then
    return new;
  end if;

  insert into gv_challenge_runs (month, track_id, player_key, nickname, user_id, frames)
  values (v_month, new.track_id, v_key,
          case when gv_name_rude(new.nickname) then 'Player'
               else coalesce(nullif(btrim(new.nickname), ''), 'Player') end,
          new.user_id, new.frames)
  on conflict (month, player_key) do update
    set nickname = excluded.nickname,
        frames   = least(excluded.frames, gv_challenge_runs.frames),
        at       = case when excluded.frames < gv_challenge_runs.frames
                        then excluded.at else gv_challenge_runs.at end;
  return new;
exception when others then
  -- The challenge must never cost a player their time on the board.
  return new;
end;
$function$;

revoke all on function public.gv_challenge_capture() from public, anon, authenticated;

drop trigger if exists gv_challenge_capture on public.polytrack_scores;
create trigger gv_challenge_capture
  before insert on public.polytrack_scores
  for each row execute function public.gv_challenge_capture();


-- Moves a player's runs and badges to another key, keeping the better time
-- where both have one. Signing in hands a guest's board rows to the account
-- (polytrack_claim), and the challenge goes with them.
create or replace function public.gv_challenge_rekey(p_from text, p_to text, p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_from is null or p_to is null or p_from = p_to then
    return;
  end if;

  insert into gv_challenge_runs (month, track_id, player_key, nickname, user_id, frames, at)
  select r.month, r.track_id, p_to, r.nickname, p_user, r.frames, r.at
  from gv_challenge_runs r
  where r.player_key = p_from
  on conflict (month, player_key) do update
    set frames = least(excluded.frames, gv_challenge_runs.frames),
        at     = case when excluded.frames < gv_challenge_runs.frames
                      then excluded.at else gv_challenge_runs.at end;
  delete from gv_challenge_runs where player_key = p_from;

  insert into gv_badges (player_key, badge, month, user_id, created_at)
  select p_to, b.badge, b.month, p_user, b.created_at
  from gv_badges b
  where b.player_key = p_from
  on conflict do nothing;
  delete from gv_badges where player_key = p_from;
end;
$function$;

revoke all on function public.gv_challenge_rekey(text, text, uuid) from public, anon, authenticated;

-- Keeps runs and badges with the board rows they came from, when a row
-- changes hands or name without a new run:
--   polytrack_claim moves a guest's rows to the account they signed in with.
--     Where the account already had a faster time on a track, it deletes the
--     guest's row instead of moving it, so that counts as a move too;
--   polytrack_set_name, and every submission, rewrite the name on a row, so
--     turning anonymous mode on takes the name off the challenge too.
create or replace function public.gv_challenge_follow()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
begin
  if tg_op = 'DELETE' then
    -- Only polytrack_claim deletes a guest's row from a signed-in session,
    -- and only when that account has a time on the same track at least as
    -- fast. Anything else, like the owner removing a time, is left alone.
    v_user := auth.uid();
    if old.user_id is null and v_user is not null and exists (
         select 1 from polytrack_scores u
         where u.user_id = v_user and u.track_id = old.track_id and u.frames <= old.frames) then
      perform gv_challenge_rekey(old.player_key, v_user::text, v_user);
    end if;
    return null;
  end if;

  if new.player_key is distinct from old.player_key then
    perform gv_challenge_rekey(old.player_key, new.player_key, new.user_id);
  end if;

  if new.nickname is distinct from old.nickname then
    update gv_challenge_runs
       set nickname = new.nickname
     where player_key = new.player_key
       and nickname is distinct from new.nickname;
  end if;
  return null;
exception when others then
  -- Nor may it stop a sign-in claiming a guest's times, or a rename.
  return null;
end;
$function$;

revoke all on function public.gv_challenge_follow() from public, anon, authenticated;

drop trigger if exists gv_challenge_follow on public.polytrack_scores;
create trigger gv_challenge_follow
  after update of user_id, visitor_id, nickname on public.polytrack_scores
  for each row
  when (old.user_id is distinct from new.user_id
        or old.visitor_id is distinct from new.visitor_id
        or old.nickname is distinct from new.nickname)
  execute function public.gv_challenge_follow();

drop trigger if exists gv_challenge_follow_claim on public.polytrack_scores;
create trigger gv_challenge_follow_claim
  after delete on public.polytrack_scores
  for each row
  when (old.user_id is null)
  execute function public.gv_challenge_follow();


-- What /challenge/ needs: the server's clock (so the countdown never depends
-- on the visitor's own), this month's challenge, its top ten, and where the
-- caller stands. The caller is found the way polytrack_board finds them: the
-- signed-in account, or else the guest's visitor id.
create or replace function public.gv_challenge_current(p_visitor_id text default null)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_key   text := coalesce(auth.uid()::text, 'guest:' || nullif(p_visitor_id, ''));
  v_month date := gv_challenge_month();
  v_row   gv_challenges;
begin
  if not public.gv_origin_allowed() then
    raise exception 'not read from this origin';
  end if;

  select * into v_row from gv_challenges where month = v_month;
  if not found then
    return json_build_object('now', now(), 'challenge', null, 'top', '[]'::json, 'you', null);
  end if;

  return (
    with ranked as (select * from gv_challenge_ranked(v_month))
    select json_build_object(
      'now', now(),
      'challenge', json_build_object(
        'month', v_row.month,
        'track_id', v_row.track_id,
        'title', v_row.title,
        'note', v_row.note,
        'ends_at', (v_row.month + interval '1 month') at time zone 'utc',
        'runners', (select count(*) from ranked)
      ),
      'top', coalesce((
        select json_agg(json_build_object(
                 'rank', r.rank,
                 'nickname', r.nickname,
                 'frames', r.frames,
                 'time', gv_challenge_time(r.frames),
                 -- The blue check, hidden on anonymous rows as the board does.
                 'verified', r.nickname <> 'Anonymous'
                             and exists (select 1 from gv_verified v where v.key = r.player_key),
                 -- Months this player has won before, for a crown by the name.
                 'wins', case when r.nickname = 'Anonymous' then 0 else (
                           select count(*) from gv_badges b
                           where b.player_key = r.player_key and b.badge = 'challenge-winner') end,
                 'you', coalesce(r.player_key = v_key, false)
               ) order by r.rank)
        from ranked r
        where r.rank <= 10
      ), '[]'::json),
      'you', (
        select json_build_object(
                 'rank', r.rank,
                 'nickname', r.nickname,
                 'frames', r.frames,
                 'time', gv_challenge_time(r.frames))
        from ranked r
        where r.player_key = v_key
      )
    )
  );
end;
$function$;

grant execute on function public.gv_challenge_current(text) to anon, authenticated;


-- Every month that has ended, newest first, with its winner. closed says
-- whether the owner has checked the times and handed out the badges yet;
-- until then the winner is only who is in front.
create or replace function public.gv_challenge_history()
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.gv_origin_allowed() then
    raise exception 'not read from this origin';
  end if;

  return coalesce((
    select json_agg(json_build_object(
             'month', c.month,
             'track_id', c.track_id,
             'title', c.title,
             'ended_at', (c.month + interval '1 month') at time zone 'utc',
             'closed', c.closed_at is not null,
             'closed_at', c.closed_at,
             'runners', (select count(*) from gv_challenge_runs r where r.month = c.month),
             'winner', (
               select json_build_object(
                        'nickname', w.nickname,
                        'frames', w.frames,
                        'time', gv_challenge_time(w.frames))
               from gv_challenge_ranked(c.month) w
               where w.rank = 1)
           ) order by c.month desc)
    from (select * from gv_challenges
          where month < gv_challenge_month()
          order by month desc
          limit 24) c
  ), '[]'::json);
end;
$function$;

grant execute on function public.gv_challenge_history() to anon, authenticated;


-- Badges for the players on a board, by player key, for drawing beside their
-- names: {"<key>": [{"badge": "challenge-winner", "month": "2026-09-01"}]}.
-- Keys with no badges are left out.
create or replace function public.gv_badges_for(p_keys text[])
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.gv_origin_allowed() then
    raise exception 'not read from this origin';
  end if;
  if p_keys is null or cardinality(p_keys) = 0 then
    return '{}'::json;
  end if;
  -- A board page is 50 rows, so a longer list is not a board.
  if cardinality(p_keys) > 200 then
    raise exception 'too many keys';
  end if;

  return coalesce((
    select json_object_agg(k.player_key, k.badges)
    from (
      select b.player_key,
             json_agg(json_build_object('badge', b.badge, 'month', b.month)
                      order by b.month desc, b.badge) as badges
      from gv_badges b
      where b.player_key = any (p_keys)
      group by b.player_key
    ) k
  ), '{}'::json);
end;
$function$;

grant execute on function public.gv_badges_for(text[]) to anon, authenticated;


-- Owner only, behind the dashboard secret.
--
-- Sets a month's track, ahead of time or for the month under way. A new track
-- starts that month's board again from the times already set on it that
-- month, which is also how a month set after it began gets its board.
create or replace function public.gv_challenge_set(
  p_secret text,
  p_month date,
  p_track_id text,
  p_title text,
  p_note text default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_month date := date_trunc('month', p_month::timestamp)::date;
  v_track text := btrim(coalesce(p_track_id, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_old   gv_challenges;
  v_row   gv_challenges;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;
  if v_month is null then
    raise exception 'pick a month';
  end if;
  if char_length(v_track) not between 1 and 120 then
    raise exception 'track id must be 1 to 120 characters';
  end if;
  if char_length(v_title) not between 1 and 80 then
    raise exception 'title must be 1 to 80 characters';
  end if;
  if char_length(v_note) > 300 then
    raise exception 'note must be 300 characters or fewer';
  end if;
  if public.gv_is_rude(v_title) or public.gv_is_rude(v_note) then
    raise exception 'the title or note has a word the site does not allow';
  end if;

  select * into v_old from gv_challenges where month = v_month for update;
  if v_old.closed_at is not null then
    raise exception 'that month is closed and its badges are given out';
  end if;

  insert into gv_challenges (month, track_id, title, note)
  values (v_month, v_track, v_title, v_note)
  on conflict (month) do update
    set track_id = excluded.track_id,
        title    = excluded.title,
        note     = excluded.note
  returning * into v_row;

  if v_old.month is null or v_old.track_id <> v_row.track_id then
    delete from gv_challenge_runs where month = v_month;
    -- updated_at is the date of each player's best ever, so this finds the
    -- players whose best on the track was set this month.
    insert into gv_challenge_runs (month, track_id, player_key, nickname, user_id, frames, at)
    select v_month, s.track_id, s.player_key, s.nickname, s.user_id, s.frames, s.updated_at
    from polytrack_scores s
    where s.track_id = v_row.track_id
      and s.updated_at >= v_month::timestamp at time zone 'utc'
      and s.updated_at < (v_month + interval '1 month') at time zone 'utc';
  end if;

  return json_build_object(
    'month', v_row.month,
    'track_id', v_row.track_id,
    'title', v_row.title,
    'note', v_row.note,
    'runners', (select count(*) from gv_challenge_runs r where r.month = v_month)
  );
end;
$function$;

-- Every challenge, newest first, with its podium and the players' keys, so the
-- owner can see what closing it will hand out.
create or replace function public.gv_challenge_list(p_secret text)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  return coalesce((
    select json_agg(json_build_object(
             'month', c.month,
             'track_id', c.track_id,
             'title', c.title,
             'note', c.note,
             'ends_at', (c.month + interval '1 month') at time zone 'utc',
             'ended', (c.month + interval '1 month') at time zone 'utc' <= now(),
             'closed_at', c.closed_at,
             'runners', (select count(*) from gv_challenge_runs r where r.month = c.month),
             'podium', coalesce((
               select json_agg(json_build_object(
                        'rank', p.rank,
                        'player_key', p.player_key,
                        'user_id', p.user_id,
                        'nickname', p.nickname,
                        'frames', p.frames,
                        'time', gv_challenge_time(p.frames),
                        'at', p.at
                      ) order by p.rank)
               from gv_challenge_ranked(c.month) p
               where p.rank <= 3
             ), '[]'::json)
           ) order by c.month desc)
    from (select * from gv_challenges order by month desc limit 24) c
  ), '[]'::json);
end;
$function$;

-- A month's whole board with the players' keys, for finding a suspicious
-- time to remove.
create or replace function public.gv_challenge_board(p_secret text, p_month date)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  return coalesce((
    select json_agg(json_build_object(
             'rank', r.rank,
             'player_key', r.player_key,
             'user_id', r.user_id,
             'nickname', r.nickname,
             'frames', r.frames,
             'time', gv_challenge_time(r.frames),
             'at', r.at
           ) order by r.rank)
    from gv_challenge_ranked(date_trunc('month', p_month::timestamp)::date) r
  ), '[]'::json);
end;
$function$;

-- Hands out the badges for a month that has ended: challenge-winner to first
-- place, challenge-top3 to second and third. Closing again, say after taking
-- out a suspicious time, hands them out afresh from the board as it now is.
create or replace function public.gv_challenge_close(p_secret text, p_month date)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_month date := date_trunc('month', p_month::timestamp)::date;
  v_row   gv_challenges;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  select * into v_row from gv_challenges where month = v_month for update;
  if not found then
    raise exception 'no challenge that month';
  end if;
  if (v_month + interval '1 month') at time zone 'utc' > now() then
    raise exception 'that month has not ended yet';
  end if;

  delete from gv_badges
   where month = v_month
     and badge in ('challenge-winner', 'challenge-top3');

  insert into gv_badges (player_key, badge, month, user_id)
  select r.player_key,
         case when r.rank = 1 then 'challenge-winner' else 'challenge-top3' end,
         v_month,
         r.user_id
  from gv_challenge_ranked(v_month) r
  where r.rank <= 3;

  update gv_challenges set closed_at = now() where month = v_month;

  return coalesce((
    select json_agg(json_build_object(
             'rank', r.rank,
             'player_key', r.player_key,
             'user_id', r.user_id,
             'nickname', r.nickname,
             'time', gv_challenge_time(r.frames),
             'badge', case when r.rank = 1 then 'challenge-winner' else 'challenge-top3' end
           ) order by r.rank)
    from gv_challenge_ranked(v_month) r
    where r.rank <= 3
  ), '[]'::json);
end;
$function$;

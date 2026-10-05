-- Weekly PolyTrack challenge.
--
-- Each week the site owner picks one PolyTrack track. Every run driven on it
-- once the track is up counts, straight from the site's PolyTrack leaderboard
-- (games/polytrack/leaderboard.sql), and once the week is over the owner
-- closes it from the analytics dashboard: first place gets the
-- challenge-winner badge, second and third get challenge-top3. The badge is
-- the whole prize. /challenge/ shows the week, /winner/ shows its winner.
--
-- A week runs Monday to Sunday and ends at midnight UTC on Sunday night, so
-- everyone has the same finish line. A time set before the week's track went
-- up does not count, even one set earlier the same week: the challenge board
-- is its own, apart from the track's all-time board.
--
-- The game only sends a run that beats the player's own best on the track.
-- games/polytrack/leaderboard.js sends the others on the week's track too,
-- when they beat the player's best this week, so a slower run than an old
-- personal best still makes the challenge board.
--
-- The challenge ran by the month until 1 October 2026. September's challenge
-- is kept as it ran, which is why a challenge has its own end date rather
-- than always lasting seven days.
--
-- Apply against project dxwjxzmlezfyursysays, after
-- games/polytrack/leaderboard.sql and sql/names.sql. Every statement is safe
-- to run twice. Applied on 30 September 2026, made weekly on 1 October 2026.


-- From monthly to weekly. Runs once, on the tables as 30 September left them,
-- and does nothing after that or on a database that never had them.
do $migrate$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'gv_challenges'
                   and column_name = 'month') then
    return;
  end if;

  -- Their parameters are renamed below, which create or replace cannot do.
  drop function if exists public.gv_challenge_month();
  drop function if exists public.gv_challenge_ranked(date);
  drop function if exists public.gv_challenge_set(text, date, text, text, text);
  drop function if exists public.gv_challenge_board(text, date);
  drop function if exists public.gv_challenge_close(text, date);
  drop function if exists public.gv_challenge_remove(text, date, text);

  alter table public.gv_challenges drop constraint gv_challenges_month_check;
  alter table public.gv_challenges rename column month to starts;
  alter table public.gv_challenges add column ends date;
  update public.gv_challenges set ends = (starts + interval '1 month')::date;
  alter table public.gv_challenges alter column ends set not null;
  alter table public.gv_challenges add constraint gv_challenges_ends_check check (ends > starts);

  alter table public.gv_challenge_runs rename column month to starts;
  alter table public.gv_challenge_runs drop constraint gv_challenge_runs_month_fkey;
  alter table public.gv_challenge_runs add constraint gv_challenge_runs_starts_fkey
    foreign key (starts) references public.gv_challenges (starts)
    on update cascade on delete cascade;

  alter table public.gv_badges rename column month to starts;

  -- October's track becomes this week's, which began on Monday 28 September.
  update public.gv_challenges set starts = '2026-09-28', ends = '2026-10-05'
   where starts = '2026-10-01';
end;
$migrate$;

-- Summer 3 went up at midnight UTC on 1 October. The move to weekly first
-- counted times set on it earlier that week, before anyone knew it was the
-- track; those come off.
delete from public.gv_challenge_runs
 where starts = '2026-09-28'
   and at < '2026-10-01 00:00:00+00';


-- One row per challenge, keyed by its first day, a Monday.
create table if not exists public.gv_challenges (
  starts    date primary key,
  -- The day after its last: midnight UTC at the end of Sunday.
  ends      date not null,
  track_id  text not null check (char_length(track_id) between 1 and 120),
  title     text not null check (char_length(title) between 1 and 80),
  note      text check (char_length(note) <= 300),
  -- When the badges were handed out. Empty until gv_challenge_close.
  closed_at timestamptz,
  constraint gv_challenges_ends_check check (ends > starts)
);

-- Each player's best run on the week's track, during that week. The board
-- keeps a player's best ever, which can be older than the week; this keeps
-- the week's best alone. player_key is the board's own key: an account's
-- user id, or 'guest:' and the browser's visitor id.
create table if not exists public.gv_challenge_runs (
  starts     date not null,
  track_id   text not null,
  player_key text not null,
  nickname   text not null,
  -- Deleting an account takes its runs with it, as it does its board times.
  user_id    uuid references auth.users (id) on delete cascade,
  frames     integer not null check (frames > 0),
  at         timestamptz not null default now(),
  primary key (starts, player_key),
  constraint gv_challenge_runs_starts_fkey foreign key (starts)
    references public.gv_challenges (starts) on update cascade on delete cascade
);

create index if not exists gv_challenge_runs_order
  on public.gv_challenge_runs (starts, frames, at);

-- Badges, keyed the same way as the board so it can show them beside a time.
-- starts is the challenge that earned the badge.
create table if not exists public.gv_badges (
  player_key text not null,
  badge      text not null check (badge ~ '^[a-z0-9-]{1,40}$'),
  starts     date not null,
  -- So deleting an account takes its badges too. Empty for a guest.
  user_id    uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_key, badge, starts)
);

-- 1, 2 or 3 on the week's board. Second and third share challenge-top3, and
-- this tells their badges apart: silver for second, bronze for third.
alter table public.gv_badges add column if not exists place smallint check (place between 1 and 3);

-- Everything goes through the functions below, so there is no policy to
-- write and a direct PostgREST request reads and writes nothing.
alter table public.gv_challenges enable row level security;
alter table public.gv_challenge_runs enable row level security;
alter table public.gv_badges enable row level security;
revoke all on table public.gv_challenges, public.gv_challenge_runs, public.gv_badges from anon, authenticated;


-- This week's Monday, by UTC.
create or replace function public.gv_challenge_week()
returns date
language sql
stable
set search_path to 'public'
as $function$
  select date_trunc('week', now() at time zone 'utc')::date;
$function$;

revoke all on function public.gv_challenge_week() from public, anon, authenticated;

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

-- A challenge's runs in finishing order. A tie goes to whoever drove it first.
create or replace function public.gv_challenge_ranked(p_starts date)
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
  where r.starts = p_starts;
$function$;

revoke all on function public.gv_challenge_ranked(date) from public, anon, authenticated;


-- Every run sent to the board passes through here on its way in.
--
-- It has to be BEFORE INSERT. polytrack_submit upserts, so by the time the
-- row is written, and so in any AFTER trigger, frames holds the player's best
-- ever, which can be a time from an earlier week. Only the proposed row
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
  v_key  text;
  v_week date;
begin
  v_key := coalesce(new.user_id::text, 'guest:' || new.visitor_id);
  v_week := gv_challenge_week();
  if v_key is null or coalesce(new.frames, 0) <= 0
     or not exists (select 1 from gv_challenges c
                    where c.starts = v_week and c.track_id = new.track_id) then
    return new;
  end if;

  insert into gv_challenge_runs (starts, track_id, player_key, nickname, user_id, frames)
  values (v_week, new.track_id, v_key,
          case when gv_name_rude(new.nickname) then 'Player'
               else coalesce(nullif(btrim(new.nickname), ''), 'Player') end,
          new.user_id, new.frames)
  on conflict (starts, player_key) do update
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


-- Moves a player's runs to another key, keeping the better time where both
-- have one. Signing in hands a guest's board rows to the account
-- (polytrack_claim), and the challenge goes with them. Badges stay where they
-- were earned: polytrack_claim takes any visitor id, so moving them would let
-- anyone take a guest's crown.
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

  insert into gv_challenge_runs (starts, track_id, player_key, nickname, user_id, frames, at)
  select r.starts, r.track_id, p_to, r.nickname, p_user, r.frames, r.at
  from gv_challenge_runs r
  where r.player_key = p_from
  on conflict (starts, player_key) do update
    set frames = least(excluded.frames, gv_challenge_runs.frames),
        at     = case when excluded.frames < gv_challenge_runs.frames
                      then excluded.at else gv_challenge_runs.at end;
  delete from gv_challenge_runs where player_key = p_from;
end;
$function$;

revoke all on function public.gv_challenge_rekey(text, text, uuid) from public, anon, authenticated;

-- Keeps runs with the board rows they came from, when a row
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
-- on the visitor's own), this week's challenge, its top ten, and where the
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
  v_key  text := coalesce(auth.uid()::text, 'guest:' || nullif(p_visitor_id, ''));
  v_week date := gv_challenge_week();
  v_row  gv_challenges;
begin
  if not public.gv_origin_allowed() then
    raise exception 'not read from this origin';
  end if;

  select * into v_row from gv_challenges where starts = v_week;
  if not found then
    return json_build_object('now', now(), 'challenge', null, 'top', '[]'::json, 'you', null);
  end if;

  return (
    with ranked as (select * from gv_challenge_ranked(v_week))
    select json_build_object(
      'now', now(),
      'challenge', json_build_object(
        'starts', v_row.starts,
        'track_id', v_row.track_id,
        'title', v_row.title,
        'note', v_row.note,
        'ends_at', v_row.ends::timestamp at time zone 'utc',
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
                 -- Challenges this player has won before, for a crown by the name.
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
                 'time', gv_challenge_time(r.frames),
                 'verified', r.nickname <> 'Anonymous'
                             and exists (select 1 from gv_verified v where v.key = r.player_key),
                 'wins', case when r.nickname = 'Anonymous' then 0 else (
                           select count(*) from gv_badges b
                           where b.player_key = r.player_key and b.badge = 'challenge-winner') end)
        from ranked r
        where r.player_key = v_key
      )
    )
  );
end;
$function$;

grant execute on function public.gv_challenge_current(text) to anon, authenticated;


-- Every challenge that has ended, newest first, with its winner. closed says
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
             'starts', c.starts,
             'track_id', c.track_id,
             'title', c.title,
             'ended_at', c.ends::timestamp at time zone 'utc',
             'closed', c.closed_at is not null,
             'closed_at', c.closed_at,
             'runners', (select count(*) from gv_challenge_runs r where r.starts = c.starts),
             'winner', (
               select json_build_object(
                        'nickname', w.nickname,
                        'frames', w.frames,
                        'time', gv_challenge_time(w.frames))
               from gv_challenge_ranked(c.starts) w
               where w.rank = 1)
           ) order by c.starts desc)
    from (select * from gv_challenges
          where ends::timestamp at time zone 'utc' <= now()
          order by starts desc
          limit 24) c
  ), '[]'::json);
end;
$function$;

grant execute on function public.gv_challenge_history() to anon, authenticated;


-- Badges for the players on a board, by player key, for drawing beside their
-- names: {"<key>": [{"badge": "challenge-winner", "starts": "2026-09-28",
-- "title": "Summer 3"}]}. Each week's badge looks different (js/badges.js
-- draws it from starts), and title names the track it was won on.
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
             json_agg(json_build_object('badge', b.badge, 'starts', b.starts, 'title', c.title)
                      order by b.starts desc, b.badge) as badges
      from gv_badges b
      left join gv_challenges c on c.starts = b.starts
      where b.player_key = any (p_keys)
      group by b.player_key
    ) k
  ), '{}'::json);
end;
$function$;

grant execute on function public.gv_badges_for(text[]) to anon, authenticated;


-- Owner only, behind the dashboard secret.
--
-- Sets a week's track, ahead of time or for the week under way. p_week is any
-- day in the week. A new track starts that week's board empty: only runs
-- driven after it goes up count.
create or replace function public.gv_challenge_set(
  p_secret text,
  p_week date,
  p_track_id text,
  p_title text,
  p_note text default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_week  date := date_trunc('week', p_week::timestamp)::date;
  v_track text := btrim(coalesce(p_track_id, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_old   gv_challenges;
  v_row   gv_challenges;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;
  if v_week is null then
    raise exception 'pick a week';
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

  select * into v_old from gv_challenges where starts = v_week for update;
  if v_old.closed_at is not null then
    raise exception 'that week is closed and its badges are given out';
  end if;

  insert into gv_challenges (starts, ends, track_id, title, note)
  values (v_week, v_week + 7, v_track, v_title, v_note)
  on conflict (starts) do update
    set track_id = excluded.track_id,
        title    = excluded.title,
        note     = excluded.note
  returning * into v_row;

  if v_old.track_id <> v_row.track_id then
    delete from gv_challenge_runs where starts = v_week;
  end if;

  return json_build_object(
    'starts', v_row.starts,
    'ends_at', v_row.ends::timestamp at time zone 'utc',
    'track_id', v_row.track_id,
    'title', v_row.title,
    'note', v_row.note,
    'runners', (select count(*) from gv_challenge_runs r where r.starts = v_week)
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
             'starts', c.starts,
             'track_id', c.track_id,
             'title', c.title,
             'note', c.note,
             'ends_at', c.ends::timestamp at time zone 'utc',
             'ended', c.ends::timestamp at time zone 'utc' <= now(),
             'closed_at', c.closed_at,
             'runners', (select count(*) from gv_challenge_runs r where r.starts = c.starts),
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
               from gv_challenge_ranked(c.starts) p
               where p.rank <= 3
             ), '[]'::json)
           ) order by c.starts desc)
    from (select * from gv_challenges order by starts desc limit 24) c
  ), '[]'::json);
end;
$function$;

-- A challenge's whole board with the players' keys, for finding a suspicious
-- time to remove. p_starts is the challenge's first day.
create or replace function public.gv_challenge_board(p_secret text, p_starts date)
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
    from gv_challenge_ranked(p_starts) r
  ), '[]'::json);
end;
$function$;

-- Hands out the badges for a challenge that has ended: challenge-winner to
-- first place, challenge-top3 to second and third. Closing again, say after
-- taking out a suspicious time, hands them out afresh from the board as it
-- now is.
create or replace function public.gv_challenge_close(p_secret text, p_starts date)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row gv_challenges;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  select * into v_row from gv_challenges where starts = p_starts for update;
  if not found then
    raise exception 'no challenge starts that day';
  end if;
  if v_row.ends::timestamp at time zone 'utc' > now() then
    raise exception 'that week has not ended yet';
  end if;

  delete from gv_badges
   where starts = p_starts
     and badge in ('challenge-winner', 'challenge-top3');

  insert into gv_badges (player_key, badge, starts, user_id)
  select r.player_key,
         case when r.rank = 1 then 'challenge-winner' else 'challenge-top3' end,
         p_starts,
         r.user_id
  from gv_challenge_ranked(p_starts) r
  where r.rank <= 3;

  update gv_challenges set closed_at = now() where starts = p_starts;

  return coalesce((
    select json_agg(json_build_object(
             'rank', r.rank,
             'player_key', r.player_key,
             'user_id', r.user_id,
             'nickname', r.nickname,
             'time', gv_challenge_time(r.frames),
             'badge', case when r.rank = 1 then 'challenge-winner' else 'challenge-top3' end
           ) order by r.rank)
    from gv_challenge_ranked(p_starts) r
    where r.rank <= 3
  ), '[]'::json);
end;
$function$;

-- Takes a suspicious time off a challenge's board. It stays on the PolyTrack
-- board, where the owner removes it separately. A closed challenge is closed
-- again, so the badges follow the board.
create or replace function public.gv_challenge_remove(p_secret text, p_starts date, p_player_key text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  delete from gv_challenge_runs where starts = p_starts and player_key = p_player_key;
  if not found then
    return false;
  end if;
  if exists (select 1 from gv_challenges where starts = p_starts and closed_at is not null) then
    perform gv_challenge_close(p_secret, p_starts);
  end if;
  return true;
end;
$function$;


-- Tracks the owner can pick from: every track on the board, most raced first,
-- with the official ones named. Community tracks have no name on the server,
-- only their id, and not every player has them.
create or replace function public.gv_challenge_tracks(p_secret text)
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
             'track_id', t.track_id,
             'name', o.name,
             'official', o.name is not null,
             'players', t.players,
             'this_week', t.this_week
           ) order by o.name is null, t.players desc, o.name)
    from (
      select s.track_id,
             count(*) as players,
             count(*) filter (where s.updated_at >= gv_challenge_week()::timestamp at time zone 'utc') as this_week
      from polytrack_scores s
      group by s.track_id
      order by count(*) desc
      limit 100
    ) t
    left join (values
      ('5803f9e963625804e3de3246d043dc7dde847aa32e991f7f7326b0453f1fa038', 'Summer 1'),
      ('7eac4fee1111152cfba4d3737410264ca0f22c7f5a2211e79f0099589b8b48c0', 'Summer 2'),
      ('148826aa16ffaa23dbc453b32cff05e025ddbce1773fc7733cc13d218926515a', 'Summer 3'),
      ('93c7363dfea7fb09ca1d23b72cad5df43a30841d41c8ff25fb544c85bb03c7ae', 'Summer 4'),
      ('7603aaeffa1989a649dfaa8e1804bed4481b49df233e377687d0669899566e52', 'Summer 5'),
      ('c117823cf6788e3247b9ee63a0c091c07352bbe352c650a7790dc6718148c2fa', 'Summer 6'),
      ('e4bcaca3a583bb0eb62a700a69d14e89c852f0c5bf740fca76e0519ebdfc9ab1', 'Summer 7'),
      ('7239b17057127936907a805b0caa5d8c6f6c97eca9bdabf1a5312dce479629b7', 'Winter 1'),
      ('99864b635d1891d22e17eb9267527a07a92c49c0f02893729fa2ded90e3ca0f9', 'Winter 2'),
      ('a5341fe706097cff2a3812a3fc0d87399254557328351ae8e5c882700fc1a196', 'Winter 3'),
      ('7d134c939df80c676a258266201beedd3b93572d5603f3ff4339ff8679803715', 'Winter 4'),
      ('2fe4bd46b0075cc25fc770ce50adbb68447cf493c999635bb272d231811dd264', 'Winter 5'),
      ('c20b4ee3cd517ca6cae7e43f047548757287fbd08ba81b97892a3ef520159a34', 'Desert 1'),
      ('88647ea04145fbbbb19b55f1590e038fb0378acb2571110f02cb545cc46b0d57', 'Desert 2'),
      ('2806030c503abb41a1a26fa9a570888be14296172bb273798ef0ad87a108a2ec', 'Desert 3'),
      ('4697ea67b18c3f49b30a3d8884602115536650bc5435c88e3732e64d21a72d33', 'Desert 4'),
      ('e5d084e06db4ab71196fea44efeceb23c8561266a78669c324a38f92581fe2db', 'Desert 5')
    ) as o (track_id, name) on o.track_id = t.track_id
  ), '[]'::json);
end;
$function$;

-- The first two challenges, both on official tracks, which every player has.
-- September ran for the whole month, on the most raced track on the board.
-- The week of 28 September is on the next most raced, so the new challenge
-- brings a new track. September's board was filled in from the times set on
-- its track during September, once: after that the owner may have removed
-- runs, and running this file again must not bring them back.
insert into public.gv_challenges (starts, ends, track_id, title) values
  ('2026-09-01', '2026-10-01', '5803f9e963625804e3de3246d043dc7dde847aa32e991f7f7326b0453f1fa038', 'Summer 1'),
  ('2026-09-28', '2026-10-05', '148826aa16ffaa23dbc453b32cff05e025ddbce1773fc7733cc13d218926515a', 'Summer 3')
on conflict (starts) do nothing;

insert into public.gv_challenge_runs (starts, track_id, player_key, nickname, user_id, frames, at)
select c.starts, s.track_id, s.player_key, s.nickname, s.user_id, s.frames, s.updated_at
from public.gv_challenges c
join public.polytrack_scores s
  on s.track_id = c.track_id
 and s.updated_at >= c.starts::timestamp at time zone 'utc'
 and s.updated_at < c.ends::timestamp at time zone 'utc'
where c.starts = '2026-09-01'
  and c.closed_at is null
  and not exists (select 1 from public.gv_challenge_runs r where r.starts = c.starts)
on conflict (starts, player_key) do nothing;

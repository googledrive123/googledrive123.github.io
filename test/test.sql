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


create table if not exists public.gv_game_reports (
  id         bigserial primary key,
  game_id    text not null check (char_length(game_id) between 1 and 100),
  user_id    uuid not null references auth.users (id) on delete cascade,
  verdict    text not null check (verdict in ('works', 'broken', 'problem')),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  -- Set by the owner once a report has been dealt with.
  resolved   boolean not null default false
);

-- A tester's own reports, newest first, are read on every visit to /test/.
create index if not exists gv_game_reports_user_created
  on public.gv_game_reports (user_id, created_at desc);

alter table public.gv_game_reports enable row level security;
revoke all on table public.gv_game_reports from anon, authenticated;


-- Asked by /test/ to decide what to show. Signed out is simply not a tester.
create or replace function public.gv_is_tester()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.gv_origin_allowed() then
    raise exception 'Testing only works on GameVault.';
  end if;

  return exists (select 1 from gv_testers where user_id = auth.uid());
end;
$function$;

revoke all on function public.gv_is_tester() from public, anon;
grant execute on function public.gv_is_tester() to authenticated;


-- A tester's verdict on one game. Every refusal is a sentence the page shows
-- as it is. Testing the same game again adds a new report rather than
-- replacing the old one, so the owner sees a game that broke after working.
create or replace function public.gv_test_report(p_game_id text, p_verdict text, p_note text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_game text := btrim(coalesce(p_game_id, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_row gv_game_reports;
begin
  if not public.gv_origin_allowed() then
    raise exception 'Testing only works on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to send a report.';
  end if;
  if not exists (select 1 from gv_testers where user_id = v_user) then
    raise exception 'Only testers can send reports.';
  end if;
  if v_game !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$' then
    raise exception 'That is not a game id.';
  end if;
  if p_verdict is null or p_verdict not in ('works', 'broken', 'problem') then
    raise exception 'Pick works, broken or problem.';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Notes can be up to 500 characters.';
  end if;
  if public.gv_is_rude(v_note) then
    raise exception 'That note has words we do not allow here. Try saying it another way.';
  end if;
  if (select count(*) from gv_game_reports
       where user_id = v_user and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'That is a lot of reports. Take a short break before sending more.';
  end if;

  insert into gv_game_reports (game_id, user_id, verdict, note)
  values (v_game, v_user, p_verdict, v_note)
  returning * into v_row;

  return json_build_object('id', v_row.id, 'game_id', v_row.game_id, 'verdict', v_row.verdict,
                           'note', v_row.note, 'created_at', v_row.created_at);
end;
$function$;

revoke all on function public.gv_test_report(text, text, text) from public, anon;
grant execute on function public.gv_test_report(text, text, text) to authenticated;

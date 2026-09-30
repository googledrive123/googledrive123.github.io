-- Usernames other players see.
--
-- Uses the chat's rude-word check (sql/rude.sql), but a username has no
-- spaces, so it is also checked with its parts pulled apart: camelCase,
-- digits, dots and underscores become spaces first.
--
-- Sign-up pre-checks the name with gv_name_ok before creating the account.
-- If a rude name still reaches the database through the API, the new profile
-- quietly gets a neutral name instead, because raising inside the sign-up
-- trigger fails the whole sign-up with a vague error. A rename, which the
-- page does itself, is refused outright.
-- Names that were already taken before this check are left alone.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 30 September 2026.

create or replace function public.gv_name_rude(p_name text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select public.gv_is_rude(p_name)
      or public.gv_is_rude(regexp_replace(regexp_replace(coalesce(p_name, ''),
           '([a-z])([A-Z])', '\1 \2', 'g'), '[^A-Za-z]+', ' ', 'g'));
$function$;

-- For the sign-up and rename forms.
create or replace function public.gv_name_ok(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;
  return not public.gv_name_rude(p_name);
end;
$function$;

grant execute on function public.gv_name_ok(text) to anon, authenticated;


-- New profiles: swap a rude name for a neutral one rather than fail sign-up.
-- Renames: refuse. Only fires when the name actually changes, so saving
-- anything else on an old profile never trips it.
create or replace function public.gv_profiles_name_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if public.gv_name_rude(new.username) then
    -- An upsert on an existing profile (the rename form) arrives as an
    -- INSERT first; that is a rename, so it is refused like one.
    if tg_op = 'INSERT' and not exists (select 1 from public.profiles where id = new.id) then
      new.username := 'player-' || left(replace(new.id::text, '-', ''), 8);
    else
      raise exception 'That username is not allowed. Try another.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists gv_profiles_name_guard_ins on public.profiles;
create trigger gv_profiles_name_guard_ins
  before insert on public.profiles
  for each row execute function public.gv_profiles_name_guard();

drop trigger if exists gv_profiles_name_guard_upd on public.profiles;
create trigger gv_profiles_name_guard_upd
  before update of username on public.profiles
  for each row when (old.username is distinct from new.username)
  execute function public.gv_profiles_name_guard();

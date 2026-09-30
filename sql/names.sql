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

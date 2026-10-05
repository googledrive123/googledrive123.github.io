-- Signing in with the username an account has now.
--
-- An account's login is the username it signed up with, as
-- <name>@gamevault.app. Renaming in the profile changes profiles.username,
-- the name everyone sees, but not the login, so a renamed player who typed
-- their new name was told the password was wrong.

create or replace function public.gv_login_email(p_name text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;
  if v_name = '' then
    return null;
  end if;

  select id into v_id from profiles where username = v_name;
  -- Typed in another case. Only when that leaves no doubt which account.
  if v_id is null then
    select min(id::text)::uuid into v_id from profiles
     where lower(username) = lower(v_name)
    having count(*) = 1;
  end if;
  if v_id is null then
    return null;
  end if;

  -- Only the site's own logins, which are just the sign-up username.
  return (select email from auth.users
           where id = v_id and email like '%@gamevault.app');
end;
$function$;

grant execute on function public.gv_login_email(text) to anon, authenticated;

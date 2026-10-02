-- Deleting an account.
--
-- The profile's "Delete account" button. Everything tied to the account goes
-- with it: most tables reference auth.users with on delete cascade (profiles,
-- play_sessions, starred_games, recently_played, polytrack_scores,
-- polytrack_saves, gv_saves, chat), so removing the auth row removes them.
-- The rest carry the id without a foreign key and are cleared here by hand.
-- Files in Storage cannot be deleted from SQL (storage.protect_delete), so
-- the page removes the account's own files through the Storage API first.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 30 September 2026.

create or replace function public.gv_delete_account()
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'sign in first';
  end if;
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;

  -- Every visit the account made goes, not just its name on them.
  delete from analytics_events where user_id = v_user;
  delete from polytrack_presence where user_id = v_user;
  delete from gv_verified where key = v_user::text;

  delete from auth.users where id = v_user;
  return true;
end;
$function$;

revoke all on function public.gv_delete_account() from public, anon;
grant execute on function public.gv_delete_account() to authenticated;

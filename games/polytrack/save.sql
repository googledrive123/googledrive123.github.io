-- Server side of the PolyTrack save kept on a GameVault account.
--
-- The game keeps its whole save in the browser: the profile with the car,
-- the best time and replay on every track, the tracks made in the editor,
-- the unlocked car parts, controls and settings. save.js copies those keys
-- here for a signed-in player and puts them back on any browser they sign in
-- on. One row per key, so a new best time sends one row and not the lot.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 28 September 2026.


create table if not exists public.polytrack_saves (
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  -- The value exactly as the game stored it. Null is a key the game removed,
  -- kept so the account's other browsers remove it too.
  value      text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- A browser that has pulled before only asks for what changed since.
create index if not exists polytrack_saves_user_updated
  on public.polytrack_saves (user_id, updated_at);

-- Read and written only through the two functions below.
alter table public.polytrack_saves enable row level security;
revoke all on table public.polytrack_saves from anon, authenticated;


-- The account's save. With no p_since, every key that still has a value:
-- that is a browser seeing this account for the first time. With one, every
-- key written since, removals included. The minute of overlap covers a write
-- that started before the last pull and landed after it; pulling a key twice
-- changes nothing.
create or replace function public.polytrack_save_pull(p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if not public.gv_origin_allowed() then
    raise exception 'saves are not served to this origin';
  end if;
  if v_user is null then
    raise exception 'not signed in';
  end if;

  return jsonb_build_object(
    'at', now(),
    'items', coalesce((
      select jsonb_object_agg(key, value)
        from polytrack_saves
       where user_id = v_user
         and ((p_since is null and value is not null)
              or updated_at > p_since - interval '1 minute')
    ), '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.polytrack_save_pull(timestamptz) from public, anon;
grant execute on function public.polytrack_save_pull(timestamptz) to authenticated;

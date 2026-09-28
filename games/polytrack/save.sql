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


-- Writes keys to the account's save, as an object of key to string, or to
-- null for a removed key. Only the keys save.js syncs are taken, so this is
-- not a general store. The game refuses to send a replay over 10,000
-- characters, and a track from the editor is the only thing that gets big.
create or replace function public.polytrack_save_push(p_items jsonb)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_item record;
  v_keys integer;
  v_size bigint;
begin
  if not public.gv_origin_allowed() then
    raise exception 'saves are not accepted from this origin';
  end if;
  if v_user is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(p_items) is distinct from 'object' then
    raise exception 'invalid items';
  end if;

  for v_item in select key, value from jsonb_each(p_items) loop
    -- Must match SYNCED in save.js.
    if v_item.key !~ ('^(polytrack_v5_prod_(user_slot|user_[0-9]{1,3}'
        || '|record_[0-9]{1,3}_(default|undeterministic)_[0-9a-f]{64}'
        || '|track_.{1,200}|unlocked_car_styles|key_bindings|settings'
        || '|is_music_enabled|startup_info)|gv\.anon)$') then
      raise exception 'invalid key %', left(v_item.key, 80);
    end if;
    if jsonb_typeof(v_item.value) not in ('string', 'null') then
      raise exception 'invalid value for %', left(v_item.key, 80);
    end if;
    if char_length(v_item.value #>> '{}') > 1000000 then
      raise exception 'value too long for %', left(v_item.key, 80);
    end if;

    insert into polytrack_saves (user_id, key, value, updated_at)
    values (v_user, v_item.key, v_item.value #>> '{}', now())
    on conflict (user_id, key) do update
      set value = excluded.value,
          updated_at = excluded.updated_at;
  end loop;

  -- A browser that has not pulled in three months gets the whole save again
  -- rather than the removals, so they are not worth keeping past that.
  delete from polytrack_saves
   where user_id = v_user
     and value is null
     and updated_at < now() - interval '90 days';

  -- A full save is a few megabytes at most. Anything far past that is not
  -- the game's, and rolls back.
  select count(*), coalesce(sum(char_length(value)), 0)
    into v_keys, v_size
    from polytrack_saves
   where user_id = v_user;
  if v_keys > 5000 or v_size > 20000000 then
    raise exception 'save is too large';
  end if;

  return now();
end;
$function$;

revoke all on function public.polytrack_save_push(jsonb) from public, anon;
grant execute on function public.polytrack_save_push(jsonb) to authenticated;

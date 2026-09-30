-- Profile pictures.
--
-- Every account shows a picture next to its name: one of the 42 built-in
-- avatars that js/avatars.js draws from a number, or a picture of its own.
-- Other players see an uploaded picture, so it waits for the site owner to
-- approve it from the analytics dashboard first. Until then the account keeps
-- showing what it showed before: the last approved picture, or its avatar.
--
-- Guests have no row here. The avatar a guest picks stays in their browser
-- (localStorage 'gv.avatar').
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 30 September 2026.


-- upload is the newest picture sent and upload_status says where it stands.
-- approved_upload is the one everyone else sees. They are kept apart so a
-- new picture waiting for review never takes the approved one down.
--
-- A picture is a data: URL of at most 60 KB (61440 characters, the URL as a
-- whole), which the page makes by shrinking to 128x128. That keeps the table
-- small and lets a name and its picture come back in one request, with no
-- Storage bucket to look after.
--
-- preset is null until the account picks one; the page then uses one worked
-- out from the account id.
create table if not exists public.gv_avatars (
  user_id uuid primary key references auth.users (id) on delete cascade,
  preset integer check (preset between 0 and 41),
  upload text check (char_length(upload) <= 61440),
  upload_status text not null default 'none'
    check (upload_status in ('none', 'pending', 'approved', 'rejected')),
  approved_upload text check (char_length(approved_upload) <= 61440),
  uploaded_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Every path in and out is a security definer function below.
alter table public.gv_avatars enable row level security;


-- The account's own state, for the profile panel. pending is the account's
-- own picture waiting for review, so the panel can show it to them alone.
create or replace function public.gv_avatar_mine()
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_row gv_avatars;
begin
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;
  if v_user is null then
    raise exception 'sign in first';
  end if;

  select * into v_row from gv_avatars where user_id = v_user;
  return json_build_object(
    'preset', v_row.preset,
    'status', coalesce(v_row.upload_status, 'none'),
    'pending', case when v_row.upload_status = 'pending' then v_row.upload end,
    'approved', v_row.approved_upload
  );
end;
$function$;

revoke all on function public.gv_avatar_mine() from public, anon;
grant execute on function public.gv_avatar_mine() to authenticated;


-- Picking a built-in avatar is choosing to show it, so it also drops any
-- picture, approved or waiting. Otherwise a picture approved later would
-- replace an avatar picked after it was sent.
create or replace function public.gv_avatar_set_preset(p_preset integer)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;
  if v_user is null then
    raise exception 'sign in first';
  end if;
  if p_preset is null or p_preset not between 0 and 41 then
    raise exception 'There is no avatar %.', p_preset;
  end if;

  insert into gv_avatars (user_id, preset)
  values (v_user, p_preset)
  on conflict (user_id) do update
    set preset = excluded.preset,
        upload = null,
        upload_status = 'none',
        approved_upload = null,
        uploaded_at = null,
        updated_at = now();

  return public.gv_avatar_mine();
end;
$function$;

revoke all on function public.gv_avatar_set_preset(integer) from public, anon;
grant execute on function public.gv_avatar_set_preset(integer) to authenticated;

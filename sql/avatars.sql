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


-- Sends a picture for review. Only a WebP, PNG or JPEG is taken, and the
-- first bytes have to agree with the type the URL names, so nothing but a
-- plain picture is ever stored and handed to other players' pages.
create or replace function public.gv_avatar_upload(p_data text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_type text;
  v_bytes bytea;
  v_last timestamptz;
begin
  if not public.gv_origin_allowed() then
    raise exception 'not from this origin';
  end if;
  if v_user is null then
    raise exception 'sign in first';
  end if;
  if p_data is null or char_length(p_data) > 61440 then
    raise exception 'That picture is too big. Pictures can be up to 60 KB.';
  end if;

  v_type := substring(p_data from '^data:image/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$');
  if v_type is null then
    raise exception 'That is not a picture that can be used here.';
  end if;
  begin
    v_bytes := decode(substring(p_data from position(',' in p_data) + 1), 'base64');
  exception when others then
    raise exception 'That is not a picture that can be used here.';
  end;
  if not coalesce(case v_type
      when 'webp' then substring(v_bytes from 1 for 4) = '\x52494646'::bytea
                   and substring(v_bytes from 9 for 4) = '\x57454250'::bytea
      when 'png' then substring(v_bytes from 1 for 8) = '\x89504e470d0a1a0a'::bytea
      else substring(v_bytes from 1 for 3) = '\xffd8ff'::bytea
    end, false) then
    raise exception 'That is not a picture that can be used here.';
  end if;

  select uploaded_at into v_last from gv_avatars where user_id = v_user;
  if v_last > now() - interval '10 seconds' then
    raise exception 'Wait a few seconds before sending another picture.';
  end if;

  insert into gv_avatars (user_id, upload, upload_status, uploaded_at)
  values (v_user, p_data, 'pending', now())
  on conflict (user_id) do update
    set upload = excluded.upload,
        -- Sending the approved picture again needs no second look.
        upload_status = case when gv_avatars.approved_upload = excluded.upload
                             then 'approved' else 'pending' end,
        uploaded_at = now(),
        updated_at = now();

  return public.gv_avatar_mine();
end;
$function$;

revoke all on function public.gv_avatar_upload(text) from public, anon;
grant execute on function public.gv_avatar_upload(text) to authenticated;


-- Names and pictures for other players: chat, leaderboards, anywhere a list
-- of accounts is shown. profiles can only be read by its own account, so
-- this is the one public way to read a name.
--
-- The name is the profile's username, or for an account made on the site
-- the name it signed up with. A rude name is not shown, as in chat. Only an
-- approved picture ever comes back. Ids with no account are left out.
create or replace function public.gv_public_profiles(p_ids uuid[])
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
    with asked as (
      select t.id, min(t.ord) as ord
      from unnest(p_ids[1:100]) with ordinality as t (id, ord)
      group by t.id
    ), named as (
      select a.id, a.ord,
             left(coalesce(
               nullif(btrim(p.username), ''),
               case when u.email like '%@gamevault.app' then split_part(u.email, '@', 1) end,
               'player'
             ), 30) as name
      from asked a
      join auth.users u on u.id = a.id
      left join profiles p on p.id = a.id
    )
    select json_agg(json_build_object(
             'id', n.id,
             'username', case when public.gv_is_rude(n.name)
                              then 'player ' || left(n.id::text, 4) else n.name end,
             'preset', v.preset,
             'upload', v.approved_upload
           ) order by n.ord)
    from named n
    left join gv_avatars v on v.user_id = n.id
  ), '[]'::json);
end;
$function$;

grant execute on function public.gv_public_profiles(uuid[]) to anon, authenticated;


-- Owner only, behind the dashboard secret. The pictures waiting for review,
-- oldest first. p_status 'approved' lists the ones already showing instead,
-- to find one to take down.
create or replace function public.gv_avatar_queue(p_secret text, p_status text default 'pending')
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
             'user_id', v.user_id,
             'username', coalesce(nullif(btrim(p.username), ''), split_part(u.email, '@', 1)),
             'upload', case when coalesce(p_status, 'pending') = 'approved'
                            then v.approved_upload else v.upload end,
             'uploaded_at', v.uploaded_at,
             'approved', v.approved_upload
           ) order by v.uploaded_at)
    from gv_avatars v
    join auth.users u on u.id = v.user_id
    left join profiles p on p.id = v.user_id
    where case when coalesce(p_status, 'pending') = 'approved'
               then v.approved_upload is not null
               else v.upload_status = 'pending' end
  ), '[]'::json);
end;
$function$;


-- Approves or turns down the picture waiting for p_user_id. Pass the
-- uploaded_at the queue showed: if the player has sent another picture since,
-- nothing happens, so a picture nobody looked at is never approved. Returns
-- the new status, or null when there was nothing (or something newer) waiting.
-- A turned-down picture is thrown away; the approved one keeps showing.
create or replace function public.gv_avatar_review(
  p_secret text,
  p_user_id uuid,
  p_approve boolean,
  p_uploaded_at timestamptz default null
) returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;
  if p_approve is null then
    raise exception 'say whether to approve';
  end if;

  update gv_avatars
     set approved_upload = case when p_approve then upload else approved_upload end,
         upload = case when p_approve then upload end,
         upload_status = case when p_approve then 'approved' else 'rejected' end,
         updated_at = now()
   where user_id = p_user_id
     and upload_status = 'pending'
     and (p_uploaded_at is null or uploaded_at = p_uploaded_at)
  returning upload_status into v_status;

  return v_status;
end;
$function$;


-- Takes down an approved picture that should not have been. The account goes
-- back to its built-in avatar and sees its picture as turned down.
create or replace function public.gv_avatar_remove(p_secret text, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  update gv_avatars
     set approved_upload = null,
         upload = case when upload_status = 'pending' then upload end,
         upload_status = case when upload_status = 'pending' then 'pending' else 'rejected' end,
         updated_at = now()
   where user_id = p_user_id
     and approved_upload is not null;

  return found;
end;
$function$;

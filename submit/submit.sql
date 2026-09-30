-- Game submissions.
--
-- /submit/ lets a signed-in player send the site owner a game as a .zip.
-- Nobody but the owner ever sees an upload: the file goes to the private
-- 'submissions' bucket, which players can add to but never read, list or
-- delete, not even their own files. The owner reads the list from the
-- analytics dashboard and downloads a file through the gv-submission-url
-- Edge Function (supabase/functions/gv-submission-url), which checks the
-- dashboard secret and hands back a link that works for 10 minutes.
--
-- The page uploads the file first and then records it with
-- gv_submission_create. gv_submission_check runs the same checks before the
-- upload, so a player hears about a bad title before sending 50 MB.
--
-- Apply against project dxwjxzmlezfyursysays, after sql/rude.sql. Every
-- statement is safe to run twice. Applied on 30 September 2026.


-- Private, zip only, 50 MB a file: the project's cap on any one upload. The
-- page checks the same number before sending.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 52428800,
        array['application/zip', 'application/x-zip-compressed'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- A new file in the player's own folder, named the way /submit/ names it:
-- <user id>/<milliseconds>-<name>.zip. At most five a day, two more than
-- gv_submission_create records, so a failed attempt can be tried again but
-- the bucket cannot be filled by uploading around the page.
--
-- The free plan holds 1 GB of files for the whole project, and saves share
-- it (saves/saves.sql). So the bucket also takes nothing new once it holds
-- more than 600 MB (629145600 bytes), until the owner clears reviewed games
-- out; one last 50 MB zip can take it to 650 MB at most. And it takes at most
-- 40 new files a day from every account together, far more than real
-- submissions, so a crowd of new accounts at five files each cannot fill it
-- in one go. The 600 MB here and the 800 MB on saves add up to more than
-- 1 GB: each one stops its own bucket filling the project alone, and the
-- two together are not promised to fit.
--
-- Security definer only to count files, which players cannot see.
create or replace function public.gv_submission_new_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select auth.uid() is not null
     and p_name ~ ('^' || auth.uid()::text || '/[0-9]{10,16}-[A-Za-z0-9._-]{1,80}\.zip$')
     and (select count(*) from storage.objects o
           where o.bucket_id = 'submissions'
             and o.name like auth.uid()::text || '/%'
             and o.created_at > now() - interval '1 day') < 5
     and (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o
           where o.bucket_id = 'submissions') <= 629145600
     and (select count(*) from storage.objects o
           where o.bucket_id = 'submissions'
             and o.created_at > now() - interval '1 day') < 40;
$function$;

revoke all on function public.gv_submission_new_file(text) from public, anon;
grant execute on function public.gv_submission_new_file(text) to authenticated;

-- Adding is the only thing a player can do in this bucket. With no select,
-- update or delete policy, not even their own file can be read back,
-- replaced or removed.
drop policy if exists gv_submissions_files_insert on storage.objects;
create policy gv_submissions_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'submissions' and public.gv_submission_new_file(name));


create table if not exists public.gv_submissions (
  id         bigserial primary key,
  -- Kept when the account is deleted, without who sent it: SQL cannot remove
  -- the file (see sql/account.sql), so the row stays for the owner to find.
  user_id    uuid references auth.users (id) on delete set null,
  title      text not null check (char_length(title) between 1 and 80),
  link       text check (char_length(link) <= 300),
  notes      text check (char_length(notes) <= 1000),
  -- Where the zip is in the 'submissions' bucket.
  path       text not null unique,
  size_bytes int,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- The daily limit looks up one account's latest submissions.
create index if not exists gv_submissions_user_created
  on public.gv_submissions (user_id, created_at desc);

alter table public.gv_submissions enable row level security;
revoke all on table public.gv_submissions from anon, authenticated;


-- Everything about a submission except the file, checked before the upload
-- and again when it is recorded. Every refusal is a sentence the page shows
-- as it is. Returns the text as it will be kept: trimmed, and with control
-- characters that could hide words taken out.
create or replace function public.gv_submission_check(p_title text, p_link text, p_notes text, p_size bigint)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '[[:space:][:cntrl:]]+', ' ', 'g'));
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
  v_notes text := nullif(btrim(regexp_replace(coalesce(p_notes, ''), '[\u0001-\u0009\u000b-\u001f\u007f]+', ' ', 'g')), '');
begin
  if not public.gv_origin_allowed() then
    raise exception 'Submissions only work on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to send a game.';
  end if;
  if v_title = '' then
    raise exception 'Give the game a name.';
  end if;
  if char_length(v_title) > 80 then
    raise exception 'Names can be up to 80 characters.';
  end if;
  if v_link is not null and (char_length(v_link) > 300 or v_link !~ '^https?://[^[:space:]]+$') then
    raise exception 'The link has to be a web address starting with https://.';
  end if;
  if char_length(v_notes) > 1000 then
    raise exception 'Notes can be up to 1000 characters.';
  end if;
  if public.gv_is_rude(v_title) or public.gv_is_rude(v_link) or public.gv_is_rude(v_notes) then
    raise exception 'That has words we do not allow here. Try saying it another way.';
  end if;
  if p_size is null or p_size < 1 or p_size > 52428800 then
    raise exception 'The zip has to be 50 MB or smaller.';
  end if;
  if (select count(*) from gv_submissions
       where user_id = v_user and created_at > now() - interval '1 day') >= 3 then
    raise exception 'You can send 3 games a day. Try again tomorrow.';
  end if;

  return json_build_object('title', v_title, 'link', v_link, 'notes', v_notes);
end;
$function$;

revoke all on function public.gv_submission_check(text, text, text, bigint) from public, anon;
grant execute on function public.gv_submission_check(text, text, text, bigint) to authenticated;


-- Records a zip the player has just uploaded. The file has to be theirs and
-- really in the bucket, and its size is read from Storage rather than taken
-- from the page.
create or replace function public.gv_submission_create(
  p_title text,
  p_link text,
  p_notes text,
  p_path text,
  p_size bigint
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_clean json;
  v_size bigint;
  v_row gv_submissions;
begin
  if v_user is null then
    raise exception 'Sign in to send a game.';
  end if;
  if p_path is null or p_path not like v_user::text || '/%' then
    raise exception 'That upload is not yours.';
  end if;

  select coalesce((o.metadata ->> 'size')::bigint, p_size) into v_size
  from storage.objects o
  where o.bucket_id = 'submissions' and o.name = p_path;
  if not found then
    raise exception 'The zip did not arrive. Try sending it again.';
  end if;
  if exists (select 1 from gv_submissions where path = p_path) then
    raise exception 'That zip was already sent.';
  end if;

  v_clean := public.gv_submission_check(p_title, p_link, p_notes, v_size);

  insert into gv_submissions (user_id, title, link, notes, path, size_bytes)
  values (v_user, v_clean ->> 'title', v_clean ->> 'link', v_clean ->> 'notes', p_path, v_size)
  returning * into v_row;

  return json_build_object('id', v_row.id, 'title', v_row.title, 'status', v_row.status,
                           'size_bytes', v_row.size_bytes, 'created_at', v_row.created_at);
end;
$function$;

revoke all on function public.gv_submission_create(text, text, text, text, bigint) from public, anon;
grant execute on function public.gv_submission_create(text, text, text, text, bigint) to authenticated;


-- What a player has sent and where each one stands. Never the file itself.
create or replace function public.gv_submission_mine()
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if not public.gv_origin_allowed() then
    raise exception 'Submissions only work on GameVault.';
  end if;
  if v_user is null then
    raise exception 'Sign in to see what you sent.';
  end if;

  return coalesce((
    select json_agg(json_build_object('id', s.id, 'title', s.title, 'status', s.status,
                                      'size_bytes', s.size_bytes, 'created_at', s.created_at)
                    order by s.id desc)
    from (select * from gv_submissions where user_id = v_user order by id desc limit 50) s
  ), '[]'::json);
end;
$function$;

revoke all on function public.gv_submission_mine() from public, anon;
grant execute on function public.gv_submission_mine() to authenticated;


-- Owner only, behind the dashboard secret: the last 300 submissions, newest
-- first. path is what the gv-submission-url Edge Function signs; the
-- dashboard asks it by id and never needs the path itself.
create or replace function public.gv_submissions_list(p_secret text)
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
             'id', s.id,
             'title', s.title,
             'link', s.link,
             'notes', s.notes,
             'size_bytes', s.size_bytes,
             'status', s.status,
             'created_at', s.created_at,
             'user_id', s.user_id,
             'username', case when s.user_id is null then 'Deleted account'
                              else coalesce(nullif(btrim(p.username), ''), 'Account ' || left(s.user_id::text, 8)) end,
             'path', s.path
           ) order by s.id desc)
    from (select * from gv_submissions order by id desc limit 300) s
    left join profiles p on p.id = s.user_id
  ), '[]'::json);
end;
$function$;


create or replace function public.gv_submission_set(p_secret text, p_id bigint, p_status text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row gv_submissions;
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;
  if p_status is null or p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'status must be pending, approved or rejected';
  end if;

  update gv_submissions set status = p_status where id = p_id returning * into v_row;
  if not found then
    raise exception 'no such submission';
  end if;
  return json_build_object('id', v_row.id, 'status', v_row.status);
end;
$function$;

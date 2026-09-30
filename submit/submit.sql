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
             and o.created_at > now() - interval '1 day') < 5;
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

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

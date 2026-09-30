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

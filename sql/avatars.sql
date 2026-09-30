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

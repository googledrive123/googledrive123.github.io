-- Game save backups kept on a GameVault account.
--
-- Most games here keep their progress in this site's own browser storage, the
-- localStorage and IndexedDB of googledrive123.github.io. js/saves.js packs
-- all of it into one JSON file. /saves/ lets a player download that file, or
-- keep it on their account: three slots they save to by hand, and an 'auto'
-- slot refreshed once a day for anyone who turned that on.
--
-- The file lives in the private 'saves' Storage bucket at
-- <user id>/<slot>.json. This table only lists the slots, so the page can show
-- names, sizes and dates without downloading every file.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 30 September 2026.


create table if not exists public.gv_saves (
  user_id    uuid not null references auth.users (id) on delete cascade,
  slot       text not null check (slot in ('1', '2', '3', 'auto')),
  -- The name a player gave a slot. The auto slot never has one.
  title      text check (char_length(title) <= 40),
  size_bytes int,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

-- The page reads and writes these rows straight through PostgREST, so the
-- policies are the whole of the protection: a player sees and changes their
-- own slots and nobody else's. Signed-out visitors have no slots at all.
alter table public.gv_saves enable row level security;
revoke all on table public.gv_saves from anon;

drop policy if exists gv_saves_select on public.gv_saves;
create policy gv_saves_select on public.gv_saves
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists gv_saves_insert on public.gv_saves;
create policy gv_saves_insert on public.gv_saves
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists gv_saves_update on public.gv_saves;
create policy gv_saves_update on public.gv_saves
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists gv_saves_delete on public.gv_saves;
create policy gv_saves_delete on public.gv_saves
  for delete to authenticated
  using (auth.uid() = user_id);


-- Private, JSON only, 45 MB a file: a little under the project's 50 MB cap on
-- any one upload. The page checks the same number before sending, so a player
-- hears why a save will not fit instead of watching an upload fail.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('saves', 'saves', false, 47185920, array['application/json'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- The four files a player's slots can be: one per slot, in a folder named
-- after their own account. Any other name, even inside that folder, is
-- refused, so the bucket holds saves and cannot become general file storage.
create or replace function public.gv_saves_own_file(p_name text)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select auth.uid() is not null
     and p_name in (auth.uid()::text || '/1.json',
                    auth.uid()::text || '/2.json',
                    auth.uid()::text || '/3.json',
                    auth.uid()::text || '/auto.json');
$function$;

drop policy if exists gv_saves_files_select on storage.objects;
create policy gv_saves_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'saves' and public.gv_saves_own_file(name));

-- An upload that replaces a slot's file needs insert and update both.
drop policy if exists gv_saves_files_insert on storage.objects;
create policy gv_saves_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'saves' and public.gv_saves_own_file(name));

drop policy if exists gv_saves_files_update on storage.objects;
create policy gv_saves_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'saves' and public.gv_saves_own_file(name))
  with check (bucket_id = 'saves' and public.gv_saves_own_file(name));

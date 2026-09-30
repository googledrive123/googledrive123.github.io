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

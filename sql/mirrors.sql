-- Backup addresses.
--
-- The whole site also runs at other github.io addresses: forks of this repo
-- and of the vault repos that pull in every change once a day (see
-- .github/workflows/sync.yml and mirrors/SETUP.md). Schools block sites one
-- address at a time, so when one is blocked another usually still works.
--
-- The owner lists them from the dashboard, /mirrors/ shows them to everyone,
-- and every listed address passes the same origin check as the main site, so
-- sign-in, saves, rooms and the rest keep working there.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 30 September 2026.


-- origin is exactly what a browser sends in its Origin header: https, the
-- host, no port, no path and no trailing slash. Anything else would never
-- match a real request.
create table if not exists public.gv_mirrors (
  origin text primary key check (origin ~ '^https://[a-z0-9.-]+$'),
  label text check (label is null or char_length(label) between 1 and 60),
  active boolean not null default true,
  added_at timestamptz not null default now()
);

-- Every path in and out is a security definer function, so there is no
-- policy to write and a direct PostgREST request reads and writes nothing.
alter table public.gv_mirrors enable row level security;

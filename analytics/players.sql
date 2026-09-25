-- Who is playing, for the analytics dashboard, and the creator's way in.
--
-- The dashboard shows visitors by id, which says nothing about who they are.
-- This puts names to them, keeps track of who is in PolyTrack right now and
-- which room they are in, and lets the site owner drop into a player's game
-- from the dashboard.
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice.


-- One row per browser with PolyTrack open, refreshed every few seconds by
-- games/polytrack/creator.js. code and role are the room the player is in,
-- and both are null for someone racing on their own. A row not refreshed in
-- the last minute is someone who has left.
create table if not exists public.polytrack_presence (
  visitor_id text primary key,
  user_id uuid,
  name text,
  code text,
  role text,
  updated_at timestamptz not null default now()
);

-- Every path in and out is a security definer function, so there is no
-- policy to write and a direct PostgREST request reads and writes nothing.
alter table public.polytrack_presence enable row level security;


-- A request from the dashboard for a solo player's game to open a room, so
-- the site owner can join them. Picked up by that player's next presence
-- beat and marked taken, so one click opens one room.
create table if not exists public.gv_creator_calls (
  id bigint generated always as identity primary key,
  visitor_id text not null,
  created_at timestamptz not null default now(),
  taken_at timestamptz
);

alter table public.gv_creator_calls enable row level security;

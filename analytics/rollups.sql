-- Running totals the dashboard reads instead of every event.
--
-- The all-time numbers, the visitor growth chart and the scanner check used
-- to read all of analytics_events on every load. That took a few seconds at
-- 76,000 rows, close to the 3 second limit Supabase puts on a request, and
-- the table grows by about 14,000 rows a day. These tables hold the same
-- counts, a little at a time, and a trigger adds to them as rows arrive.
--
--   analytics_visitors        when each visitor was first and last seen, and
--                             first did something on purpose
--   analytics_visitor_traits  how often each visitor reported each time zone
--                             and window size, for the scanner check
--
-- Apply against project dxwjxzmlezfyursysays, before analytics/visitors.sql.
-- Every statement is safe to run twice.


create table if not exists public.analytics_visitors (
  visitor_id text primary key,
  first_ts timestamptz not null,
  last_ts timestamptz not null,
  first_act timestamptz
);

create table if not exists public.analytics_visitor_traits (
  visitor_id text not null,
  trait text not null,
  value text not null,
  n bigint not null,
  primary key (visitor_id, trait, value)
);

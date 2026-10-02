-- Every new event pushed to open dashboards the moment it is written.
--
-- The dashboard asked for new events every 10 seconds and the live view
-- every second. Now a trigger hands each insert's events to Supabase
-- Realtime, which sends them straight on to every dashboard listening, a
-- fraction of a second after the tracker sends them. The dashboards still
-- ask now and then, for anything lost on the way.
--
-- Realtime's public channels have no login, so the channel's name is what
-- keeps it private: a long random one kept in analytics_settings next to
-- the secret, and handed out only for the secret.
--
-- Apply against project dxwjxzmlezfyursysays, after analytics/rows.sql.
-- Every statement is safe to run twice.


alter table public.analytics_settings
  add column if not exists live_topic text
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
update public.analytics_settings
  set live_topic = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
  where live_topic is null;


-- The channel's name, for the dashboard secret.
create or replace function public.analytics_live_topic(p_secret text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.analytics_check(p_secret) then
    raise exception 'not allowed';
  end if;

  return (select 'analytics-' || live_topic from analytics_settings where id = 1);
end;
$function$;

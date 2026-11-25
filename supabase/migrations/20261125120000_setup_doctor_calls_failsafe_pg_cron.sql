-- ==============================================================================
-- GREEN-API DEVELOPER PLAN 24/7 DOCTOR CALLS FAILSAFE (Supabase pg_cron + pg_net)
-- Replaces aggressive 15-second client-side browser polling (172,800+ slow calls/mo/tab)
-- with a single lightweight server-to-server sweep every 2 minutes (?mode=fast:
-- incomingOnly=true, journalMinutes=15, zero sleep, ~400ms wall-clock).
-- Ensures 24/7 Doctor Call recovery on Green-API's 3-chat free Developer Plan
-- even when all hospital computers/browsers are closed.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'doctor-calls-failsafe-every-2-min') THEN
    PERFORM cron.unschedule('doctor-calls-failsafe-every-2-min');
  END IF;
END $$;

SELECT cron.schedule(
  'doctor-calls-failsafe-every-2-min',
  '*/2 * * * *',
  $$SELECT net.http_post(
    url := 'https://elite-doctor-checkin-rev.vercel.app/api/doctor-calls/poll?mode=fast',
    headers := '{"Content-Type": "application/json", "x-vercel-cron": "1"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );$$
);

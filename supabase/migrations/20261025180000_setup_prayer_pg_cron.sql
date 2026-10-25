-- ==============================================================================
-- PRAYER AUTOMATION CRON SCHEDULER (Supabase pg_cron + pg_net)
-- Enables 24/7 background dispatching every minute without active browser tab
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- 2. Idempotently unschedule existing jobs if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prayer-dispatch-every-minute') THEN
    PERFORM cron.unschedule('prayer-dispatch-every-minute');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prayer-weekly-fetch-friday') THEN
    PERFORM cron.unschedule('prayer-weekly-fetch-friday');
  END IF;
END $$;

-- 3. Minute Dispatcher: Runs every minute 24/7/365 to check prayer times
SELECT cron.schedule(
  'prayer-dispatch-every-minute',
  '* * * * *',
  $$SELECT net.http_get(
    url := 'https://elite-doctor-checkin-rev.vercel.app/api/prayer/dispatch',
    headers := '{"Content-Type": "application/json", "x-vercel-cron": "1"}'::jsonb,
    timeout_milliseconds := 15000
  );$$
);

-- 4. Weekly Fetch: Runs every Friday at 04:00 AM UTC (06:00 AM Cairo) to pre-cache upcoming week
SELECT cron.schedule(
  'prayer-weekly-fetch-friday',
  '0 4 * * 5',
  $$SELECT net.http_get(
    url := 'https://elite-doctor-checkin-rev.vercel.app/api/prayer/fetch?force=1',
    headers := '{"Content-Type": "application/json", "x-vercel-cron": "1"}'::jsonb,
    timeout_milliseconds := 25000
  );$$
);

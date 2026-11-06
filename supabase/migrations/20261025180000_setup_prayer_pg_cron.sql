-- ==============================================================================
-- PRAYER AUTOMATION CRON SCHEDULER (Supabase pg_cron + pg_net)
-- Optimized for Free Tier: Evaluates prayer times inside Postgres every minute
-- and invokes Vercel HTTP endpoint ONLY when a prayer is due (or cache is missing).
-- Also purges old cron.job_run_details receipts (> 3 days) weekly.
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- 2. Create an in-database evaluator function so pg_cron only calls Vercel when needed
CREATE OR REPLACE FUNCTION public.trigger_prayer_dispatch_if_due()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cairo_now TIMESTAMP;
  v_today DATE;
  v_tomorrow DATE;
  v_now_minutes INTEGER;
  v_is_paused BOOLEAN := false;
  v_today_count INTEGER := 0;
  v_tomorrow_count INTEGER := 0;
  v_is_due BOOLEAN := false;
BEGIN
  -- 1. Check if prayer automation is paused by admin
  SELECT (status = 'paused')
  INTO v_is_paused
  FROM public.prayer_notifications
  WHERE prayer_date = DATE '1970-01-01' AND prayer = '__SETTINGS__'
  LIMIT 1;

  IF COALESCE(v_is_paused, false) THEN
    RETURN;
  END IF;

  -- 2. Resolve current Cairo date & time (handles EET/EEST DST automatically)
  v_cairo_now := timezone('Africa/Cairo', now());
  v_today := v_cairo_now::date;
  v_tomorrow := (v_cairo_now + INTERVAL '1 day')::date;
  v_now_minutes := EXTRACT(HOUR FROM v_cairo_now)::int * 60 + EXTRACT(MINUTE FROM v_cairo_now)::int;

  -- 3. Self-healing check: if today's 5 prayers are not yet cached in prayer_times, wake Vercel to fetch & dispatch
  SELECT count(*) INTO v_today_count
  FROM public.prayer_times
  WHERE prayer_date = v_today;

  IF v_today_count < 5 THEN
    PERFORM net.http_get(
      url := 'https://elite-doctor-checkin-rev.vercel.app/api/prayer/dispatch',
      headers := '{"Content-Type": "application/json", "x-vercel-cron": "1"}'::jsonb,
      timeout_milliseconds := 15000
    );
    RETURN;
  END IF;

  -- 4. Check if any prayer today is within the 0 to +2 minute tolerance window AND not already sent/skipped
  SELECT EXISTS (
    SELECT 1
    FROM public.prayer_times pt
    LEFT JOIN public.prayer_notifications pn
      ON pn.prayer_date = pt.prayer_date AND pn.prayer = pt.prayer
    WHERE pt.prayer_date = v_today
      AND (
        v_now_minutes - (EXTRACT(HOUR FROM pt.prayer_time)::int * 60 + EXTRACT(MINUTE FROM pt.prayer_time)::int)
      ) BETWEEN 0 AND 2
      AND COALESCE(pn.status, 'pending') NOT IN ('sent', 'sending', 'skipped')
  ) INTO v_is_due;

  IF v_is_due THEN
    PERFORM net.http_get(
      url := 'https://elite-doctor-checkin-rev.vercel.app/api/prayer/dispatch',
      headers := '{"Content-Type": "application/json", "x-vercel-cron": "1"}'::jsonb,
      timeout_milliseconds := 15000
    );
    RETURN;
  END IF;

  -- 5. Proactive tomorrow pre-cache check once per hour (at minute :05) if tomorrow is missing
  IF EXTRACT(MINUTE FROM v_cairo_now)::int = 5 THEN
    SELECT count(*) INTO v_tomorrow_count
    FROM public.prayer_times
    WHERE prayer_date = v_tomorrow;

    IF v_tomorrow_count < 5 THEN
      PERFORM net.http_get(
        url := 'https://elite-doctor-checkin-rev.vercel.app/api/prayer/dispatch',
        headers := '{"Content-Type": "application/json", "x-vercel-cron": "1"}'::jsonb,
        timeout_milliseconds := 15000
      );
    END IF;
  END IF;
END;
$$;

-- 3. Idempotently unschedule existing jobs if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prayer-dispatch-every-minute') THEN
    PERFORM cron.unschedule('prayer-dispatch-every-minute');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prayer-weekly-fetch-friday') THEN
    PERFORM cron.unschedule('prayer-weekly-fetch-friday');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-cron-job-history') THEN
    PERFORM cron.unschedule('purge-cron-job-history');
  END IF;
END $$;

-- 4. Minute Dispatcher: Evaluates locally in Postgres (<1ms) and only calls Vercel when due
SELECT cron.schedule(
  'prayer-dispatch-every-minute',
  '* * * * *',
  $$SELECT public.trigger_prayer_dispatch_if_due();$$
);

-- 5. Weekly Fetch: Runs every Friday at 04:00 AM UTC (06:00 AM Cairo) to pre-cache upcoming week
SELECT cron.schedule(
  'prayer-weekly-fetch-friday',
  '0 4 * * 5',
  $$SELECT net.http_get(
    url := 'https://elite-doctor-checkin-rev.vercel.app/api/prayer/fetch?force=1',
    headers := '{"Content-Type": "application/json", "x-vercel-cron": "1"}'::jsonb,
    timeout_milliseconds := 25000
  );$$
);

-- 6. Weekly Maintenance: Purges internal pg_cron execution logs older than 3 days (never touches app tables)
SELECT cron.schedule(
  'purge-cron-job-history',
  '0 3 * * 0',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - INTERVAL '3 days';$$
);

-- Also run a one-time immediate cleanup of old cron.job_run_details & net._http_response older than 3 days
DELETE FROM cron.job_run_details WHERE start_time < now() - INTERVAL '3 days';
